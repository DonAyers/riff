import { describe, expect, it } from "vitest";
import {
  applyEdgeFades,
  clampLatencyNudgeMs,
  computePeaks,
  estimateRoundTripLatencySeconds,
  extractFrames,
  formatLoopTime,
  getCapturedEndFrame,
  getLoopPositionSeconds,
  getNextLoopBoundarySeconds,
  pruneChunks,
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
});
