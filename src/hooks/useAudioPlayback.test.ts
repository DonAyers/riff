import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioPlayback } from "./useAudioPlayback";

const mockEncodeWav = vi.hoisted(() => vi.fn());

vi.mock("../lib/audioExport", () => ({
  encodeWav: mockEncodeWav,
}));

class MockAudio {
  static instances: MockAudio[] = [];

  currentTime = 0;
  duration = 0;
  onended: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn(() => Promise.resolve());
  load = vi.fn();
  removeAttribute = vi.fn((name: string) => {
    if (name === "src") {
      this.src = "";
    }
  });

  constructor(public src: string) {
    MockAudio.instances.push(this);
  }

  static reset() {
    MockAudio.instances = [];
  }
}

describe("useAudioPlayback", () => {
  beforeEach(() => {
    MockAudio.reset();
    mockEncodeWav.mockReset().mockReturnValue(new Blob(["wav"], { type: "audio/wav" }));

    let objectUrlCounter = 0;
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => `blob:mock-${++objectUrlCounter}`),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disposes the previous audio element before replacing it", () => {
    const { result } = renderHook(() => useAudioPlayback());

    act(() => {
      result.current.load(new Float32Array([0.1, -0.2]), 44100);
    });

    expect(mockEncodeWav).toHaveBeenCalledWith(new Float32Array([0.1, -0.2]), 44100);

    const firstAudio = MockAudio.instances[0];
    if (!firstAudio) {
      throw new Error("expected first audio instance");
    }

    firstAudio.duration = 1.5;
    act(() => {
      firstAudio.onloadedmetadata?.();
    });

    expect(result.current.duration).toBe(1.5);

    act(() => {
      result.current.play();
    });

    expect(result.current.isPlaying).toBe(true);

    act(() => {
      result.current.loadBlob(new Blob(["next"], { type: "audio/webm" }));
    });

    const secondAudio = MockAudio.instances[1];
    if (!secondAudio) {
      throw new Error("expected replacement audio instance");
    }

    expect(firstAudio.pause).toHaveBeenCalledTimes(1);
    expect(firstAudio.onended).toBeNull();
    expect(firstAudio.onloadedmetadata).toBeNull();
    expect(firstAudio.removeAttribute).toHaveBeenCalledWith("src");
    expect(firstAudio.load).toHaveBeenCalledTimes(1);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
    expect(secondAudio.src).toBe("blob:mock-2");
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.duration).toBe(0);
  });

  it("disposes the current audio element on unmount", () => {
    const { result, unmount } = renderHook(() => useAudioPlayback());

    act(() => {
      const blob = new Blob(["audio"], { type: "audio/webm" });
      result.current.loadBlob(blob);
    });

    const audio = MockAudio.instances[0];
    if (!audio) {
      throw new Error("expected audio instance");
    }

    unmount();

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.onended).toBeNull();
    expect(audio.onloadedmetadata).toBeNull();
    expect(audio.removeAttribute).toHaveBeenCalledWith("src");
    expect(audio.load).toHaveBeenCalledTimes(1);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-1");
  });
});
