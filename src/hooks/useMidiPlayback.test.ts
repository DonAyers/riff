import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMidiPlayback } from "./useMidiPlayback";
import type { MappedNote } from "../lib/noteMapper";

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

function note(overrides: Partial<MappedNote> = {}): MappedNote {
  return {
    midi: 52,
    name: "E3",
    pitchClass: "E",
    octave: 3,
    startTimeS: 0,
    durationS: 0.05,
    amplitude: 0.4,
    ...overrides,
  };
}

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
      result.current.load([note()]);
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

  it("shares sustain shaping across a clustered guitar strum without stretching later strums", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    act(() => {
      result.current.load([
        note({ midi: 52, name: "E3", pitchClass: "E", startTimeS: 0 }),
        note({ midi: 55, name: "G3", pitchClass: "G", startTimeS: 0.08 }),
        note({ midi: 59, name: "B3", pitchClass: "B", startTimeS: 0.5 }),
      ]);
    });

    expect(result.current.duration).toBeCloseTo(0.8, 5);

    await act(async () => {
      await result.current.play();
    });

    const playbackByMidi = new Map(
      smplrMocks.start.mock.calls.map(([args]) => [
        (args as { note: number }).note,
        args as { duration: number },
      ])
    );

    expect(playbackByMidi.get(52)?.duration).toBeCloseTo(0.38, 5);
    expect(playbackByMidi.get(55)?.duration).toBeCloseTo(0.3, 5);
    expect(playbackByMidi.get(59)?.duration).toBeCloseTo(0.3, 5);
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

  it("extends all notes in a guitar strum cluster to share the latest release", async () => {
    const { result } = renderHook(() => useMidiPlayback("guitar"));

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
        {
          midi: 55,
          name: "G3",
          pitchClass: "G",
          octave: 3,
          startTimeS: 0.08,
          durationS: 0.3,
          amplitude: 0.42,
        },
      ]);
    });

    await act(async () => {
      await result.current.play();
    });

    expect(smplrMocks.start).toHaveBeenCalledTimes(2);
    expect(smplrMocks.start.mock.calls[0][0].duration).toBeCloseTo(0.5, 5);
    expect(smplrMocks.start.mock.calls[1][0].duration).toBeCloseTo(0.42, 5);
  });
});
