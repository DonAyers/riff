import { describe, expect, it } from "vitest";
import {
  applyEdgeFades,
  clampLatencyNudgeMs,
  clampLoopWindow,
  computePeaks,
  estimateRoundTripLatencySeconds,
  extractFrames,
  formatLoopTime,
  getCapturedEndFrame,
  getLoopPositionSeconds,
  getNextLoopBoundarySeconds,
  pruneChunks,
  renderLoopWindow,
  slipLoopWindow,
  snapLoopWindowToBeats,
  type CaptureChunk,
} from "./looper";

function chunk(startFrame: number, length: number): CaptureChunk {
  return { startFrame, samples: Float32Array.from({ length }, (_, i) => startFrame + i) };
}

describe("looper helpers", () => {
  it("finds the loop position and the next loop start on the shared clock", () => {
    expect(getLoopPositionSeconds(13.5, 10, 2)).toBeCloseTo(1.5);
    expect(getLoopPositionSeconds(9.5, 10, 2)).toBeCloseTo(1.5);
    expect(getLoopPositionSeconds(5, 10, 0)).toBe(0);
    expect(getNextLoopBoundarySeconds(13.5, 10, 2)).toBe(14);
    expect(getNextLoopBoundarySeconds(14, 10, 2)).toBe(14);
    expect(getNextLoopBoundarySeconds(8, 10, 2)).toBe(10);
  });

  it("extracts an exact frame window across chunk edges and pads gaps with silence", () => {
    const chunks = [chunk(100, 50), chunk(150, 50), chunk(260, 40)];
    const window = extractFrames(chunks, 140, 30);

    expect(Array.from(window.slice(0, 20))).toEqual(Array.from({ length: 20 }, (_, i) => 140 + i));
    expect(extractFrames(chunks, 190, 80)[0]).toBe(190);
    expect(extractFrames(chunks, 190, 80)[30]).toBe(0);
    expect(extractFrames(chunks, 190, 80)[70]).toBe(260);
    expect(getCapturedEndFrame(chunks)).toBe(300);
    expect(getCapturedEndFrame([])).toBe(0);
  });

  it("prunes chunks that end before the oldest frame still needed", () => {
    const chunks = [chunk(0, 10), chunk(10, 10), chunk(20, 10)];
    expect(pruneChunks(chunks, 15).map((c) => c.startFrame)).toEqual([10, 20]);
  });

  it("fades both loop edges to avoid a click at the seam", () => {
    const samples = new Float32Array(10).fill(1);
    applyEdgeFades(samples, 4);

    expect(samples[0]).toBe(0);
    expect(samples[9]).toBe(0);
    expect(samples[2]).toBeCloseTo(0.5);
    expect(samples[5]).toBe(1);
  });

  it("computes waveform peaks per bin", () => {
    const samples = Float32Array.from([0.1, -0.8, 0.2, 0.3]);
    expect(computePeaks(samples, 2).map((peak) => Number(peak.toFixed(2)))).toEqual([0.8, 0.3]);
    expect(computePeaks(new Float32Array(0), 4)).toEqual([]);
  });

  it("adds known latencies and the player's nudge, ignoring missing values", () => {
    expect(
      estimateRoundTripLatencySeconds({ baseLatency: 0.01, outputLatency: 0.02, inputLatency: 0.005, nudgeMs: 15 })
    ).toBeCloseTo(0.05);
    expect(estimateRoundTripLatencySeconds({ outputLatency: Number.NaN })).toBe(0);
    expect(estimateRoundTripLatencySeconds({ nudgeMs: -200 })).toBe(0);
    expect(clampLatencyNudgeMs(1000)).toBe(300);
    expect(clampLatencyNudgeMs(-1000)).toBe(-100);
    expect(clampLatencyNudgeMs(Number.NaN)).toBe(0);
  });

  it("formats loop lengths", () => {
    expect(formatLoopTime(4.23)).toBe("0:04.2");
    expect(formatLoopTime(65)).toBe("1:05.0");
  });

  it("keeps a loop window inside the handles and at least the minimum length", () => {
    const limits = { minStartFrame: -100, maxEndFrame: 1100, minLengthFrames: 200 };

    expect(clampLoopWindow({ startFrame: -500, endFrame: 5000 }, limits)).toEqual({ startFrame: -100, endFrame: 1100 });
    // Moving the end too close to the start pushes the end back out.
    expect(clampLoopWindow({ startFrame: 300, endFrame: 350 }, limits, "end")).toEqual({ startFrame: 300, endFrame: 500 });
    // Moving the start too close to the end pushes the start back.
    expect(clampLoopWindow({ startFrame: 300, endFrame: 350 }, limits, "start")).toEqual({ startFrame: 150, endFrame: 350 });
    expect(clampLoopWindow({ startFrame: 2000, endFrame: 2100 }, limits, "start")).toEqual({ startFrame: 900, endFrame: 1100 });
    expect(clampLoopWindow({ startFrame: 10.4, endFrame: 600.6 }, limits)).toEqual({ startFrame: 10, endFrame: 601 });
  });

  it("renders a loop window with silence past the captured audio", () => {
    // Frame f of the take is source[originIndex + f] = 1000 + f.
    const source = Float32Array.from({ length: 50 }, (_, i) => 1000 + i - 10);
    const output = renderLoopWindow(source, 10, { startFrame: -5, endFrame: 45 }, 0);

    expect(output).toHaveLength(50);
    expect(output[0]).toBe(995);
    expect(output[5]).toBe(1000);
    expect(output[44]).toBe(1039);
    // Past the end of the source the loop is padded with silence.
    expect(output[45]).toBe(0);
    expect(output[49]).toBe(0);
  });

  it("crossfades the audio after the loop end into the loop start so the seam is continuous", () => {
    const source = Float32Array.from({ length: 100 }, (_, i) => i);
    const output = renderLoopWindow(source, 0, { startFrame: 20, endFrame: 60 }, 8);

    // Playback wraps from frame 59 to what followed it in the recording (frame 60).
    expect(output[output.length - 1]).toBe(59);
    expect(output[0]).toBeCloseTo(60, 6);
    // Halfway through, both sides are at equal power.
    expect(output[4]).toBeCloseTo(24 * Math.SQRT1_2 + 64 * Math.SQRT1_2, 4);
    // After the crossfade the loop is untouched.
    expect(output[8]).toBe(28);
  });

  it("slides a loop window without changing its length, stopping at the handles", () => {
    const limits = { minStartFrame: -100, maxEndFrame: 1100, minLengthFrames: 200 };

    expect(slipLoopWindow({ startFrame: 0, endFrame: 1000 }, -50, limits)).toEqual({ startFrame: -50, endFrame: 950 });
    expect(slipLoopWindow({ startFrame: 0, endFrame: 1000 }, 400, limits)).toEqual({ startFrame: 100, endFrame: 1100 });
    expect(slipLoopWindow({ startFrame: 0, endFrame: 1000 }, -400, limits)).toEqual({ startFrame: -100, endFrame: 900 });
  });

  it("rounds a loop window to whole beats inside the handles", () => {
    const limits = { minStartFrame: -100, maxEndFrame: 1100, minLengthFrames: 200 };

    expect(snapLoopWindowToBeats({ startFrame: 0, endFrame: 760 }, 250, limits)).toEqual({
      window: { startFrame: 0, endFrame: 750 },
      beats: 3,
    });
    // Rounding up to 5 beats would pass the post-roll handle.
    expect(snapLoopWindowToBeats({ startFrame: 0, endFrame: 1100 }, 250, limits)).toEqual({
      window: { startFrame: 0, endFrame: 1000 },
      beats: 4,
    });
    // One beat is shorter than the minimum loop, so it takes two.
    expect(snapLoopWindowToBeats({ startFrame: 0, endFrame: 120 }, 150, limits).beats).toBe(2);
  });
});
