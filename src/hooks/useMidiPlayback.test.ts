import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMidiPlayback } from "./useMidiPlayback";
import type { MappedNote } from "../lib/noteMapper";

const smplrMocks = vi.hoisted(() => {
  let loadPromise = Promise.resolve<void>(undefined);

  return {
    start: vi.fn(),
    stop: vi.fn(),
    constructor: vi.fn(),
    getLoadPromise: () => loadPromise,
    setLoadPromise: (promise: Promise<void>) => {
      loadPromise = promise;
    },
  };
});

vi.mock("smplr", () => ({
  Soundfont: class MockSoundfont {
    load = smplrMocks.getLoadPromise();
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useMidiPlayback", () => {
  const audioContext = {
    state: "running" as AudioContextState,
    currentTime: 10,
    resume: vi.fn<() => Promise<void>>(),
    close: vi.fn<() => Promise<void>>(),
  };

  beforeEach(() => {
    smplrMocks.start.mockReset();
    smplrMocks.stop.mockReset();
    smplrMocks.constructor.mockReset();
    smplrMocks.setLoadPromise(Promise.resolve());
    vi.useFakeTimers();

    audioContext.state = "running";
    audioContext.currentTime = 10;
    audioContext.resume.mockReset();
    audioContext.resume.mockImplementation(async () => {
      audioContext.state = "running";
    });
    audioContext.close.mockReset();
    audioContext.close.mockResolvedValue(undefined);

    class MockAudioContext {
      get state() {
        return audioContext.state;
      }

      get currentTime() {
        return audioContext.currentTime;
      }

      resume = audioContext.resume;
      close = audioContext.close;
    }

    vi.stubGlobal("AudioContext", MockAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn()
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates an acoustic steel guitar sampler when playback starts", async () => {
    const { result } = renderHook(() => useMidiPlayback());

    act(() => {
      result.current.load([note({ durationS: 0.2 })]);
    });

    await act(async () => {
      await result.current.play();
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

  it("resumes a suspended context before playback and note previews", async () => {
    audioContext.state = "suspended";
    const { result } = renderHook(() => useMidiPlayback());

    act(() => {
      result.current.load([note()]);
    });

    await act(async () => {
      await result.current.play();
    });

    expect(audioContext.resume).toHaveBeenCalledTimes(1);

    audioContext.state = "suspended";
    audioContext.resume.mockClear();

    await act(async () => {
      await result.current.previewNote({
        midi: 57,
        amplitude: 0.3,
        durationS: 0.5,
      });
    });

    expect(audioContext.resume).toHaveBeenCalledTimes(1);
  });

  it("does not stack overlapping play requests while the sampler is still loading", async () => {
    const deferredLoad = createDeferred<void>();
    smplrMocks.setLoadPromise(deferredLoad.promise);

    const { result } = renderHook(() => useMidiPlayback());

    act(() => {
      result.current.load([
        note(),
        note({ midi: 55, name: "G3", pitchClass: "G", startTimeS: 0.25 }),
      ]);
    });

    let firstPlay!: Promise<void>;
    let secondPlay!: Promise<void>;

    await act(async () => {
      firstPlay = result.current.play();
      secondPlay = result.current.play();
      await Promise.resolve();
    });

    deferredLoad.resolve();

    await act(async () => {
      await Promise.all([firstPlay, secondPlay]);
    });

    expect(smplrMocks.start).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending play cleanly when stop is pressed before loading finishes", async () => {
    const deferredLoad = createDeferred<void>();
    smplrMocks.setLoadPromise(deferredLoad.promise);

    const { result } = renderHook(() => useMidiPlayback());

    act(() => {
      result.current.load([note()]);
    });

    let pendingPlay!: Promise<void>;

    await act(async () => {
      pendingPlay = result.current.play();
      await Promise.resolve();
    });

    act(() => {
      result.current.stop();
    });

    deferredLoad.resolve();

    await act(async () => {
      await pendingPlay;
    });

    expect(smplrMocks.start).not.toHaveBeenCalled();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentTimeS).toBe(0);
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
