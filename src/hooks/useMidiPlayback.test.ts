import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMidiPlayback } from "./useMidiPlayback";

const smplrMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  constructor: vi.fn(),
}));

vi.mock("smplr", () => ({
  Soundfont: class MockSoundfont {
    load = Promise.resolve();
    start = smplrMocks.start;
    stop = smplrMocks.stop;

    constructor(_ctx: unknown, options: { instrument: string }) {
      smplrMocks.constructor(options);
    }
  },
}));

describe("useMidiPlayback", () => {
  beforeEach(() => {
    smplrMocks.start.mockReset();
    smplrMocks.stop.mockReset();
    smplrMocks.constructor.mockReset();
    vi.useFakeTimers();

    const audioContext = {
      state: "running",
      currentTime: 10,
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    class MockAudioContext {
      state = audioContext.state;
      currentTime = audioContext.currentTime;
      resume = audioContext.resume;
      close = audioContext.close;
    }

    vi.stubGlobal("AudioContext", MockAudioContext as unknown as typeof AudioContext);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads an acoustic steel guitar sampler", () => {
    const { result } = renderHook(() => useMidiPlayback());

    act(() => {
      result.current.load([
        {
          midi: 52,
          name: "E3",
          pitchClass: "E",
          octave: 3,
          startTimeS: 0,
          durationS: 0.2,
          amplitude: 0.4,
        },
      ]);
    });

    expect(smplrMocks.constructor).toHaveBeenCalledWith({
      instrument: "acoustic_guitar_steel",
    });
  });

  it("extends short note playback with a sustain floor and release tail", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    act(() => {
      result.current.load([
        {
          midi: 52,
          name: "E3",
          pitchClass: "E",
          octave: 3,
          startTimeS: 0,
          durationS: 0.05,
          amplitude: 0.4,
        },
      ]);
    });

    await act(async () => {
      await result.current.play();
    });

    expect(smplrMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 52,
        duration: 0.3,
      })
    );
  });

  it("uses detected note duration when previewing a note", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    await act(async () => {
      await result.current.previewNote({
        midi: 57,
        amplitude: 0.3,
        durationS: 0.5,
      });
    });

    expect(smplrMocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        note: 57,
        duration: 0.62,
        velocity: expect.any(Number),
      })
    );
  });
});
