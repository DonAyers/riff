import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGuitarTuner } from "./useGuitarTuner";

type MockTrack = { stop: ReturnType<typeof vi.fn> };
type MockStream = { getTracks: () => MockTrack[] };

function fillSineWave(buffer: Float32Array, frequencyHz: number, sampleRate: number) {
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * 0.8;
  }
}

describe("useGuitarTuner", () => {
  const getUserMedia = vi.fn<() => Promise<MockStream>>();
  let rafCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    getUserMedia.mockReset();
    rafCallback = null;
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia,
      },
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      rafCallback = callback;
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts microphone analysis and exposes tuning readings", async () => {
    const stopTrack = vi.fn();
    const stream: MockStream = {
      getTracks: () => [{ stop: stopTrack }],
    };
    getUserMedia.mockResolvedValue(stream);

    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      disconnect: vi.fn(),
      getFloatTimeDomainData: vi.fn((buffer: Float32Array) => {
        fillSineWave(buffer, 110, 44100);
      }),
    };
    const audioContext = {
      sampleRate: 44100,
      state: "running",
      close: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      createAnalyser: vi.fn(() => analyser),
      createMediaStreamSource: vi.fn(() => source),
    };

    vi.stubGlobal("AudioContext", function MockAudioContext() {
      return audioContext;
    });

    const { result } = renderHook(() => useGuitarTuner());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("listening");
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
      },
    });
    expect(analyser.fftSize).toBe(8192);
    expect(source.connect).toHaveBeenCalledWith(analyser);

    await act(async () => {
      rafCallback?.(0);
    });

    await waitFor(() => {
      expect(result.current.reading?.target.note).toBe("A2");
    });
    expect(result.current.reading?.frequencyHz).toBeCloseTo(110, 1);
  });

  it("smooths jumpy cents readings between analysis frames", async () => {
    const stream: MockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    };
    getUserMedia.mockResolvedValue(stream);

    let inputFrequencyHz = 112;
    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      disconnect: vi.fn(),
      getFloatTimeDomainData: vi.fn((buffer: Float32Array) => {
        fillSineWave(buffer, inputFrequencyHz, 44100);
      }),
    };
    const audioContext = {
      sampleRate: 44100,
      state: "running",
      close: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      createAnalyser: vi.fn(() => analyser),
      createMediaStreamSource: vi.fn(() => source),
    };

    vi.stubGlobal("AudioContext", function MockAudioContext() {
      return audioContext;
    });

    const { result } = renderHook(() => useGuitarTuner());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      rafCallback?.(0);
    });

    const firstCents = result.current.reading?.cents ?? 0;
    expect(firstCents).toBeGreaterThan(20);

    inputFrequencyHz = 108;
    await act(async () => {
      rafCallback?.(16);
    });

    const secondCents = result.current.reading?.cents ?? 0;
    expect(secondCents).toBeLessThan(firstCents);
    expect(secondCents).toBeGreaterThan(-15);
  });

  it("folds high E harmonic readings from live analyzer frames", async () => {
    const stream: MockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    };
    getUserMedia.mockResolvedValue(stream);

    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      disconnect: vi.fn(),
      getFloatTimeDomainData: vi.fn((buffer: Float32Array) => {
        fillSineWave(buffer, 659.2552, 44100);
      }),
    };
    const audioContext = {
      sampleRate: 44100,
      state: "running",
      close: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      createAnalyser: vi.fn(() => analyser),
      createMediaStreamSource: vi.fn(() => source),
    };

    vi.stubGlobal("AudioContext", function MockAudioContext() {
      return audioContext;
    });

    const { result } = renderHook(() => useGuitarTuner());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      rafCallback?.(0);
    });

    await waitFor(() => {
      expect(result.current.reading?.target.note).toBe("E4");
    });
    expect(result.current.reading?.frequencyHz).toBeCloseTo(329.6276, 1);
  });

  it("stops microphone resources", async () => {
    const stopTrack = vi.fn();
    const stream: MockStream = {
      getTracks: () => [{ stop: stopTrack }],
    };
    getUserMedia.mockResolvedValue(stream);

    const source = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      disconnect: vi.fn(),
      getFloatTimeDomainData: vi.fn(),
    };
    const audioContext = {
      sampleRate: 44100,
      state: "running",
      close: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      createAnalyser: vi.fn(() => analyser),
      createMediaStreamSource: vi.fn(() => source),
    };

    vi.stubGlobal("AudioContext", function MockAudioContext() {
      return audioContext;
    });

    const { result } = renderHook(() => useGuitarTuner());

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.stop();
    });

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(audioContext.close).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("idle");
  });

  it("reports microphone startup errors", async () => {
    getUserMedia.mockRejectedValue(new Error("permission denied"));

    const { result } = renderHook(() => useGuitarTuner());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBe("permission denied");
  });
});
