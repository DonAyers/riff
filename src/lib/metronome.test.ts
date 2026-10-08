import { describe, expect, it } from "vitest";
import {
  addTap,
  clampBpm,
  fitTempo,
  formatBpm,
  getBarFrames,
  getBeatInBar,
  getTapTempo,
  quantizeBars,
  renderClickTrack,
} from "./metronome";

describe("metronome helpers", () => {
  it("rounds a bar to whole frames so loops are exact multiples of it", () => {
    expect(getBarFrames(120, 4, 48000)).toBe(96000);
    // 113 BPM: a beat is 25,486.7 frames, but the bar is rounded once.
    expect(getBarFrames(113, 4, 48000)).toBe(101947);
  });

  it("clamps tempo to a sane range with one decimal", () => {
    expect(clampBpm(10)).toBe(40);
    expect(clampBpm(400)).toBe(240);
    expect(clampBpm(117.345)).toBe(117.3);
    expect(clampBpm(Number.NaN)).toBe(100);
  });

  it("renders evenly spaced clicks with an accented downbeat and silence between them", () => {
    const sampleRate = 48000;
    const track = renderClickTrack(96000, 4, 4, sampleRate);
    const peakNear = (frame: number) =>
      Math.max(...Array.from(track.subarray(frame, frame + 200), (value) => Math.abs(value)));

    expect(track).toHaveLength(96000);
    for (const beat of [0, 1, 2, 3]) expect(peakNear(beat * 24000)).toBeGreaterThan(0.2);
    expect(peakNear(0)).toBeGreaterThan(peakNear(24000));
    expect(peakNear(12000)).toBe(0);
    expect(renderClickTrack(0, 4, 4, sampleRate)).toHaveLength(0);
  });

  it("closes a take on the nearest bar line, never shorter than one bar", () => {
    expect(quantizeBars(96000 * 2.4, 96000)).toBe(2);
    expect(quantizeBars(96000 * 2.6, 96000)).toBe(3);
    expect(quantizeBars(1000, 96000)).toBe(1);
  });

  it("averages taps and starts over after a long pause", () => {
    let taps = addTap([], 0);
    expect(getTapTempo(taps)).toBeNull();
    taps = addTap(taps, 500);
    taps = addTap(taps, 1000);
    expect(getTapTempo(taps)).toBe(120);

    taps = addTap(taps, 5000);
    expect(taps).toEqual([5000]);
    for (let i = 1; i <= 8; i += 1) taps = addTap(taps, 5000 + i * 600);
    expect(taps).toHaveLength(5);
    expect(getTapTempo(taps)).toBe(100);
  });

  it("fits a tempo to a freely played loop by trying whole bar counts", () => {
    // 2 s of 4/4 is one bar at 120; two bars would be 240.
    expect(fitTempo(2, 4)).toEqual({ beats: 4, bpm: 120 });
    expect(fitTempo(8, 4)).toEqual({ beats: 16, bpm: 120 });
    const odd = fitTempo(3.3, 3);
    expect(odd.beats % 3).toBe(0);
    expect(odd.bpm).toBeGreaterThanOrEqual(70);
    expect(odd.bpm).toBeLessThanOrEqual(160);
    // Too short for any bar count to land in range: count beats instead.
    expect(fitTempo(0.5, 4)).toEqual({ beats: 1, bpm: 120 });
  });

  it("finds the beat of the bar and formats tempo", () => {
    expect(getBeatInBar(0, 0.5, 4)).toBe(0);
    expect(getBeatInBar(1.6, 0.5, 4)).toBe(3);
    expect(getBeatInBar(2.1, 0.5, 4)).toBe(0);
    expect(getBeatInBar(-0.1, 0.5, 4)).toBe(-1);
    expect(formatBpm(120)).toBe("120");
    expect(formatBpm(117.25)).toBe("117.3");
  });
});
