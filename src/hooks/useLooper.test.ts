import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLooper } from "./useLooper";

vi.mock("../worklets/looper-capture.worklet?worker&url", () => ({
  default: "looper-capture.worklet.js",
}));

const SAMPLE_RATE = 48000;

interface MockBufferSource {
  buffer: { length: number; data: Float32Array } | null;
  loop: boolean;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onended: null;
}

function connectable<T extends object>(node: T) {
  return Object.assign(node, {
    connect: vi.fn((target: unknown) => target),
    disconnect: vi.fn(),
  });
}

function createAudioMocks() {
  const sources: MockBufferSource[] = [];
  const gains: { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> } }[] = [];
  let workletPort: { onmessage: ((event: { data: unknown }) => void) | null } = { onmessage: null };
  const context = {
    currentTime: 0,
    sampleRate: SAMPLE_RATE,
    state: "running",
    baseLatency: 0.01,
    outputLatency: 0.02,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    createMediaStreamSource: vi.fn(() => connectable({})),
    createGain: vi.fn(() => {
      const gain = connectable({ gain: { value: 1, setTargetAtTime: vi.fn() } });
      gains.push(gain);
      return gain;
    }),
    createBuffer: vi.fn((_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { length, data, copyToChannel: (samples: Float32Array) => data.set(samples) };
    }),
    createBufferSource: vi.fn(() => {
      const source = connectable({
        buffer: null,
        loop: false,
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      }) as MockBufferSource;
      sources.push(source);
      return source;
    }),
  };

  vi.stubGlobal("AudioContext", function MockAudioContext() {
    return context;
  });
  vi.stubGlobal("AudioWorkletNode", function MockAudioWorkletNode() {
    const node = connectable({ port: { onmessage: null } });
    workletPort = node.port;
    return node;
  });

  /** Delivers captured frames [fromFrame, toFrame) where each sample's value is its frame / 1e6. */
  function deliverFrames(fromFrame: number, toFrame: number) {
    for (let start = fromFrame; start < toFrame; start += 2048) {
      const samples = new Float32Array(Math.min(2048, toFrame - start));
      for (let i = 0; i < samples.length; i += 1) samples[i] = (start + i) / 1e6;
      workletPort.onmessage?.({ data: { startFrame: start, samples } });
    }
  }

  return { context, sources, gains, deliverFrames };
}

describe("useLooper", () => {
  const getUserMedia = vi.fn();
  const stopTrack = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    getUserMedia.mockReset();
    stopTrack.mockReset();
    getUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: stopTrack }],
      getAudioTracks: () => [{ getSettings: () => ({}) }],
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  async function recordFirstLoop(
    mocks: ReturnType<typeof createAudioMocks>,
    result: { current: ReturnType<typeof useLooper> },
    captureFromS = 1
  ) {
    mocks.context.currentTime = 1;
    await act(async () => {
      await result.current.toggleRecord(0);
    });
    mocks.context.currentTime = 3;
    await act(async () => {
      await result.current.toggleRecord(0);
    });
    act(() => {
      mocks.deliverFrames(captureFromS * SAMPLE_RATE, 3 * SAMPLE_RATE + 2048);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
  }

  async function recordOverdub(
    mocks: ReturnType<typeof createAudioMocks>,
    result: { current: ReturnType<typeof useLooper> },
    index: number
  ) {
    mocks.context.currentTime = 3.5;
    await act(async () => {
      await result.current.toggleRecord(index);
    });
    mocks.context.currentTime = 7.1;
    act(() => {
      mocks.deliverFrames(3 * SAMPLE_RATE + 2048, 8 * SAMPLE_RATE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
  }

  const lastSource = (mocks: ReturnType<typeof createAudioMocks>) => mocks.sources[mocks.sources.length - 1];

  it("opens a raw microphone and sets the loop length from the first take", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());

    await recordFirstLoop(mocks, result);

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }),
    });
    expect(result.current.loopDurationS).toBe(2);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.tracks[0].status).toBe("playing");
    expect(result.current.tracks[0].peaks.length).toBeGreaterThan(0);

    const [player] = mocks.sources;
    expect(player.loop).toBe(true);
    expect(player.buffer?.length).toBe(2 * SAMPLE_RATE);
    // The loop seam is the stop press at t=3 s, so starting 30 ms later starts 30 ms in.
    expect(player.start).toHaveBeenCalledWith(expect.closeTo(3.03, 6), expect.closeTo(0.03, 6));
    expect(player.buffer?.data[SAMPLE_RATE]).toBeCloseTo((1 * SAMPLE_RATE + SAMPLE_RATE) / 1e6, 6);
  });

  it("resets the loop when it is stopped before the first take is committed", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());

    mocks.context.currentTime = 1;
    await act(async () => {
      await result.current.toggleRecord(0);
    });
    mocks.context.currentTime = 3;
    await act(async () => {
      await result.current.toggleRecord(0);
    });
    // The capture has not delivered the take yet, and the player taps Stop.
    act(() => {
      result.current.togglePlayback();
    });

    expect(result.current.loopDurationS).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.tracks[0].status).toBe("empty");

    // A late capture must not resurrect the cancelled take.
    act(() => {
      mocks.deliverFrames(1 * SAMPLE_RATE, 3 * SAMPLE_RATE + 2048);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });
    expect(mocks.sources).toHaveLength(0);
  });

  it("rejects a first loop that is too short", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());

    mocks.context.currentTime = 1;
    await act(async () => {
      await result.current.toggleRecord(0);
    });
    mocks.context.currentTime = 1.2;
    await act(async () => {
      await result.current.toggleRecord(0);
    });

    expect(result.current.loopDurationS).toBeNull();
    expect(result.current.tracks[0].status).toBe("empty");
    expect(result.current.error).toMatch(/at least/);
  });

  it("records overdubs from the next loop start, shifted by the round-trip latency", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result);

    mocks.context.currentTime = 3.5;
    await act(async () => {
      await result.current.toggleRecord(1);
    });
    expect(result.current.tracks[1].status).toBe("armed");

    // Next loop start after t=3.6 s is t=5 s; round trip = 10 ms base + 20 ms output.
    const fromFrame = 5 * SAMPLE_RATE + Math.round(0.03 * SAMPLE_RATE);
    mocks.context.currentTime = 5;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.tracks[1].status).toBe("recording");

    mocks.context.currentTime = 7.1;
    act(() => {
      mocks.deliverFrames(5 * SAMPLE_RATE, fromFrame + 2 * SAMPLE_RATE + 2048);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(result.current.tracks[1].status).toBe("playing");
    const overdub = mocks.sources[mocks.sources.length - 1];
    expect(overdub.buffer?.length).toBe(2 * SAMPLE_RATE);
    expect(overdub.buffer?.data[1000]).toBeCloseTo((fromFrame + 1000) / 1e6, 6);
    // Started mid-loop, at the same loop position as track 1.
    const [whenS, offsetS] = overdub.start.mock.calls[0] as [number, number];
    expect(offsetS).toBeCloseTo((((whenS - 3) % 2) + 2) % 2, 6);
  });

  it("applies the saved latency nudge to overdubs", async () => {
    localStorage.setItem("riff:looper-latency-nudge-ms", "100");
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    expect(result.current.latencyNudgeMs).toBe(100);
    await recordFirstLoop(mocks, result);

    mocks.context.currentTime = 3.5;
    await act(async () => {
      await result.current.toggleRecord(1);
    });
    const fromFrame = 5 * SAMPLE_RATE + Math.round(0.13 * SAMPLE_RATE);
    mocks.context.currentTime = 7.2;
    act(() => {
      mocks.deliverFrames(5 * SAMPLE_RATE, fromFrame + 2 * SAMPLE_RATE + 2048);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    const overdub = mocks.sources[mocks.sources.length - 1];
    expect(overdub.buffer?.data[1000]).toBeCloseTo((fromFrame + 1000) / 1e6, 6);

    act(() => {
      result.current.setLatencyNudgeMs(999);
    });
    expect(result.current.latencyNudgeMs).toBe(300);
  });

  it("cancels an armed overdub and keeps the loop playing", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result);

    await act(async () => {
      await result.current.toggleRecord(2);
    });
    await act(async () => {
      await result.current.toggleRecord(2);
    });

    expect(result.current.tracks[2].status).toBe("empty");
    expect(result.current.isPlaying).toBe(true);
  });

  it("mutes with a ramp, stops, restarts from the top and clears", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result);

    act(() => {
      result.current.toggleMute(0);
    });
    expect(result.current.tracks[0].muted).toBe(true);
    // gains[0] is the silent capture sink; track gains follow.
    expect(mocks.gains[1].gain.setTargetAtTime).toHaveBeenCalledWith(0, 3, 0.01);

    act(() => {
      result.current.togglePlayback();
    });
    expect(result.current.isPlaying).toBe(false);
    expect(mocks.sources[0].stop).toHaveBeenCalled();

    mocks.context.currentTime = 10;
    act(() => {
      result.current.togglePlayback();
    });
    expect(result.current.isPlaying).toBe(true);
    expect(mocks.sources[mocks.sources.length - 1].start).toHaveBeenCalledWith(10.03, 0);

    act(() => {
      result.current.clearAll();
    });
    expect(result.current.loopDurationS).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.tracks.every((track) => track.status === "empty")).toBe(true);
  });

  it("reports a microphone failure", async () => {
    createAudioMocks();
    getUserMedia.mockRejectedValue(new Error("Permission denied"));
    const { result } = renderHook(() => useLooper());

    await act(async () => {
      await result.current.toggleRecord(0);
    });

    expect(result.current.error).toBe("Microphone unavailable: Permission denied");
    expect(result.current.tracks[0].status).toBe("empty");
  });

  it("stops the microphone if the capture worklet fails to load", async () => {
    const mocks = createAudioMocks();
    mocks.context.audioWorklet.addModule.mockRejectedValueOnce(new Error("worklet failed"));
    const { result } = renderHook(() => useLooper());

    await act(async () => {
      await result.current.toggleRecord(0);
    });

    expect(result.current.error).toBe("Microphone unavailable: worklet failed");
    expect(stopTrack).toHaveBeenCalled();
    expect(mocks.context.close).toHaveBeenCalled();
  });

  it("releases the microphone and audio context on unmount", async () => {
    const mocks = createAudioMocks();
    const { result, unmount } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result);

    unmount();

    expect(stopTrack).toHaveBeenCalled();
    expect(mocks.context.close).toHaveBeenCalled();
  });

  it("extends the loop end into the audio captured after the closing press", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result);
    expect(result.current.loopTrim).toEqual({ startMs: 0, endMs: 0 });

    act(() => {
      result.current.setLoopTrim({ endMs: 500 });
    });
    expect(result.current.loopTrim).toEqual({ startMs: 0, endMs: 500 });
    expect(result.current.loopDurationS).toBe(2.5);
    // The audio after the press has not been captured yet, so the extension is silent for now.
    expect(lastSource(mocks).buffer?.length).toBe(2.5 * SAMPLE_RATE);
    expect(lastSource(mocks).buffer?.data[Math.round(2.2 * SAMPLE_RATE)]).toBe(0);

    // Once the post-roll arrives, the loop is rebuilt with the real audio.
    act(() => {
      mocks.deliverFrames(3 * SAMPLE_RATE + 2048, 5 * SAMPLE_RATE + 2048);
    });
    expect(lastSource(mocks).buffer?.data[Math.round(2.2 * SAMPLE_RATE)]).toBeCloseTo((3.2 * SAMPLE_RATE) / 1e6, 6);
  });

  it("moves the loop start into the audio before the start press and keeps the playhead on the music", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result, 0.5);
    const firstPlayer = lastSource(mocks);

    mocks.context.currentTime = 3.5;
    act(() => {
      result.current.setLoopTrim({ startMs: -250 });
    });

    expect(result.current.loopDurationS).toBe(2.25);
    const player = lastSource(mocks);
    expect(player).not.toBe(firstPlayer);
    expect(player.buffer?.data[SAMPLE_RATE]).toBeCloseTo((1.75 * SAMPLE_RATE) / 1e6, 6);
    // The new player takes over exactly when the old one stops, with no gap.
    const [whenS, offsetS] = player.start.mock.calls[0] as [number, number];
    expect(firstPlayer.stop).toHaveBeenCalledWith(whenS);
    // 0.53 s into the old loop is 0.78 s into the new one, which starts 0.25 s earlier.
    expect(whenS).toBeCloseTo(3.53, 6);
    expect(offsetS).toBeCloseTo(0.78, 6);
  });

  it("never trims the loop below the minimum length", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result);

    act(() => {
      result.current.setLoopTrim({ endMs: -1900 });
    });

    expect(result.current.loopTrim).toEqual({ startMs: 0, endMs: -1500 });
    expect(result.current.loopDurationS).toBe(0.5);

    act(() => {
      result.current.resetLoopTrim();
    });
    expect(result.current.loopTrim).toEqual({ startMs: 0, endMs: 0 });
    expect(result.current.loopDurationS).toBe(2);
  });

  it("locks the loop edges once another track is recorded and unlocks them when it is undone", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result);
    await recordOverdub(mocks, result, 1);

    expect(result.current.tracks[1].status).toBe("playing");
    expect(result.current.loopTrim).toBeNull();
    act(() => {
      result.current.setLoopTrim({ endMs: 300 });
    });
    expect(result.current.loopDurationS).toBe(2);

    expect(result.current.canUndo).toBe(true);
    act(() => {
      result.current.undoLastTake();
    });
    expect(result.current.tracks[1].status).toBe("empty");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.loopTrim).toEqual({ startMs: 0, endMs: 0 });
  });

  it("undoes a re-recorded track back to its previous take", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result);
    const originalBuffer = lastSource(mocks).buffer;
    const originalPeaks = result.current.tracks[0].peaks;

    await recordOverdub(mocks, result, 0);
    expect(lastSource(mocks).buffer).not.toBe(originalBuffer);
    // The re-recorded take has no handles to trim from.
    expect(result.current.loopTrim).toBeNull();

    act(() => {
      result.current.undoLastTake();
    });
    expect(lastSource(mocks).buffer).toBe(originalBuffer);
    expect(result.current.tracks[0].peaks).toEqual(originalPeaks);
    expect(result.current.loopTrim).toEqual({ startMs: 0, endMs: 0 });
  });

  it("undoing the first take clears the loop, and trimming forgets the undo", async () => {
    const mocks = createAudioMocks();
    const { result } = renderHook(() => useLooper());
    await recordFirstLoop(mocks, result);

    expect(result.current.canUndo).toBe(true);
    act(() => {
      result.current.undoLastTake();
    });
    expect(result.current.loopDurationS).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.tracks[0].status).toBe("empty");

    await recordFirstLoop(mocks, result);
    act(() => {
      result.current.setLoopTrim({ endMs: 100 });
    });
    expect(result.current.canUndo).toBe(false);
  });

  describe("metronome", () => {
    const BAR = 2 * SAMPLE_RATE; // One bar of 4/4 at 120 BPM.

    function useClick(bpm = 120) {
      localStorage.setItem("riff:looper-metronome", JSON.stringify({ clickOn: true, bpm, beatsPerBar: 4 }));
    }

    /** Sources playing into the click's gain node (created after the four track gains). */
    const clickSources = (mocks: ReturnType<typeof createAudioMocks>) =>
      mocks.sources.filter((source) => source.connect.mock.calls[0]?.[0] === mocks.gains[5]);

    it("counts in one bar, closes on the nearest bar line and shifts the take by the round trip", async () => {
      useClick();
      const mocks = createAudioMocks();
      const { result } = renderHook(() => useLooper());

      mocks.context.currentTime = 1;
      await act(async () => {
        await result.current.toggleRecord(0);
      });
      expect(result.current.tracks[0].status).toBe("armed");
      // The click starts on the count-in downbeat, 100 ms ahead, with a one-bar buffer.
      const [countIn] = clickSources(mocks);
      expect(countIn.buffer?.length).toBe(BAR);
      expect(countIn.start).toHaveBeenCalledWith(expect.closeTo(1.1, 6), 0);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      expect(result.current.tracks[0].status).toBe("recording");

      // Recording began at 3.1 s; a press 2.15 bars later closes the loop on bar 2.
      mocks.context.currentTime = 7.4;
      await act(async () => {
        await result.current.toggleRecord(0);
      });
      expect(result.current.grid).toEqual({ beats: 8, bpm: 120 });
      expect(result.current.loopDurationS).toBe(4);

      const startFrame = Math.round(1.1 * SAMPLE_RATE) + BAR;
      const latencyFrames = Math.round(0.03 * SAMPLE_RATE);
      act(() => {
        mocks.deliverFrames(startFrame - BAR, startFrame + 2 * BAR + latencyFrames + 4096);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30);
      });

      expect(result.current.tracks[0].status).toBe("playing");
      const track = mocks.sources.find((source) => source.connect.mock.calls[0]?.[0] === mocks.gains[1]);
      expect(track?.buffer?.length).toBe(2 * BAR);
      expect(track?.buffer?.data[1000]).toBeCloseTo((startFrame + latencyFrames + 1000) / 1e6, 6);

      // The click now loops at the loop's length, in step with the loop epoch (7.1 s).
      const click = clickSources(mocks).slice(-1)[0]!;
      expect(click.buffer?.length).toBe(2 * BAR);
      const [whenS, offsetS] = click.start.mock.calls[0] as [number, number];
      expect(offsetS).toBeCloseTo((((whenS - 7.1) % 4) + 4) % 4, 6);
    });

    it("calls the take off when tapped again during the count-in", async () => {
      useClick();
      const mocks = createAudioMocks();
      const { result } = renderHook(() => useLooper());

      mocks.context.currentTime = 1;
      await act(async () => {
        await result.current.toggleRecord(0);
      });
      mocks.context.currentTime = 2;
      await act(async () => {
        await result.current.toggleRecord(0);
      });

      expect(result.current.tracks[0].status).toBe("empty");
      expect(result.current.loopDurationS).toBeNull();
      expect(clickSources(mocks)[0].stop).toHaveBeenCalled();
    });

    it("fits a tempo to a free loop and lets the guess be doubled or halved", async () => {
      const mocks = createAudioMocks();
      const { result } = renderHook(() => useLooper());
      await recordFirstLoop(mocks, result);
      expect(result.current.grid).toBeNull();
      expect(clickSources(mocks)).toHaveLength(0);

      act(() => {
        result.current.fitTempoToLoop();
      });
      expect(result.current.grid).toEqual({ beats: 4, bpm: 120 });
      expect(result.current.metronome.clickOn).toBe(true);
      expect(clickSources(mocks).slice(-1)[0]?.buffer?.length).toBe(BAR);

      act(() => {
        result.current.scaleTempo(2);
      });
      expect(result.current.grid).toEqual({ beats: 8, bpm: 240 });
      act(() => {
        result.current.scaleTempo(2);
      });
      // 480 BPM is out of range.
      expect(result.current.grid).toEqual({ beats: 8, bpm: 240 });
      act(() => {
        result.current.scaleTempo(0.5);
        result.current.scaleTempo(0.5);
      });
      expect(result.current.grid).toEqual({ beats: 2, bpm: 60 });

      // Tempo is fixed while a loop exists.
      act(() => {
        result.current.setBpm(90);
      });
      expect(result.current.metronome.bpm).toBe(60);
    });

    it("snaps the loop end to whole beats and slides the start on a grid", async () => {
      const mocks = createAudioMocks();
      const { result } = renderHook(() => useLooper());
      await recordFirstLoop(mocks, result);
      act(() => {
        result.current.fitTempoToLoop();
      });

      act(() => {
        result.current.setLoopTrim({ endMs: 300 });
      });
      // 2.3 s rounds to 5 beats of 0.5 s.
      expect(result.current.loopTrim).toEqual({ startMs: 0, endMs: 500 });
      expect(result.current.grid?.beats).toBe(5);
      expect(result.current.loopDurationS).toBe(2.5);

      act(() => {
        result.current.setLoopTrim({ startMs: -100 });
      });
      expect(result.current.loopTrim).toEqual({ startMs: -100, endMs: 400 });
      expect(result.current.loopDurationS).toBe(2.5);
    });

    it("sets the tempo by tapping and stops the click with the loop", async () => {
      const now = vi.spyOn(performance, "now");
      const mocks = createAudioMocks();
      const { result } = renderHook(() => useLooper());

      for (const timeMs of [0, 600, 1200]) {
        now.mockReturnValue(timeMs);
        act(() => {
          result.current.tapTempo();
        });
      }
      expect(result.current.metronome.bpm).toBe(100);

      act(() => {
        result.current.setBeatsPerBar(3);
        result.current.setBeatsPerBar(9);
      });
      expect(result.current.metronome.beatsPerBar).toBe(3);
      expect(JSON.parse(localStorage.getItem("riff:looper-metronome") ?? "{}")).toMatchObject({ bpm: 100, beatsPerBar: 3 });

      await recordFirstLoop(mocks, result);
      act(() => {
        result.current.fitTempoToLoop();
      });
      const click = clickSources(mocks).slice(-1)[0]!;
      act(() => {
        result.current.togglePlayback();
      });
      expect(click.stop).toHaveBeenCalled();
      expect(result.current.getBeatPosition()).toBeNull();
      now.mockRestore();
    });
  });
});
