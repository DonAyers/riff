import { describe, expect, it } from "vitest";
import {
  midiToFrequency,
  renderNote,
  renderStrum,
  strumOffsets,
  voicingToMidi,
} from "./pluckSynth";

const SAMPLE_RATE = 44100;

// Autocorrelation pitch estimate with parabolic interpolation.
function estimatePitch(signal: Float32Array, expectedHz: number, sampleRate = SAMPLE_RATE): number {
  const start = Math.floor(0.3 * sampleRate);
  const length = 4096;
  const correlate = (lag: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += signal[start + i] * signal[start + i + lag];
    return sum;
  };
  const minLag = Math.floor(sampleRate / (expectedHz * 1.1));
  const maxLag = Math.ceil(sampleRate / (expectedHz / 1.1));
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const value = correlate(lag);
    if (value > best) {
      best = value;
      bestLag = lag;
    }
  }
  const [y0, y1, y2] = [correlate(bestLag - 1), best, correlate(bestLag + 1)];
  return sampleRate / (bestLag + (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2));
}

function cents(actual: number, expected: number) {
  return 1200 * Math.log2(actual / expected);
}

function rms(signal: Float32Array, fromS: number, toS: number) {
  const from = Math.floor(fromS * SAMPLE_RATE);
  const to = Math.floor(toS * SAMPLE_RATE);
  let sum = 0;
  for (let i = from; i < to; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / (to - from));
}

describe("voicingToMidi", () => {
  it("maps standard-tuning frets to MIDI notes and keeps muted strings empty", () => {
    expect(voicingToMidi([-1, 3, 2, 0, 1, 0])).toEqual([null, 48, 52, 55, 60, 64]);
    expect(voicingToMidi([3, 2, 0, 0, 0, 3])).toEqual([43, 47, 50, 55, 59, 67]);
  });
});

describe("strumOffsets", () => {
  it("staggers sounding strings low to high on a down strum and skips muted ones", () => {
    expect(strumOffsets([null, 48, 52, 55, 60, 64], "down", 0.01)).toEqual([null, 0, 0.01, 0.02, 0.03, 0.04]);
  });

  it("reverses the order on an up strum", () => {
    const offsets = strumOffsets([null, null, 50, 57, 62, 66], "up", 0.01);
    expect(offsets[5]).toBe(0);
    expect(offsets[2]).toBeCloseTo(0.03);
  });
});

describe("renderNote", () => {
  it.each([40, 52, 64, 76, 88])("plays MIDI %i within 1 cent of concert pitch", (midi) => {
    const signal = renderNote(midi, SAMPLE_RATE);
    const pitch = estimatePitch(signal, midiToFrequency(midi));
    expect(Math.abs(cents(pitch, midiToFrequency(midi)))).toBeLessThan(1);
  });

  it("decays like a plucked string and never clips", () => {
    const signal = renderNote(45, SAMPLE_RATE);
    expect(Math.max(...signal.map(Math.abs))).toBeLessThanOrEqual(0.6 + 1e-6);
    expect(rms(signal, 1.5, 1.9)).toBeLessThan(rms(signal, 0.05, 0.45) / 4);
    expect(signal.every(Number.isFinite)).toBe(true);
  });

  it("also renders at 48 kHz in tune (iOS and most Android devices)", () => {
    const signal = renderNote(64, 48000);
    const pitch = estimatePitch(signal, midiToFrequency(64), 48000);
    expect(Math.abs(cents(pitch, midiToFrequency(64)))).toBeLessThan(1);
  });
});

describe("renderStrum", () => {
  const cMajor = voicingToMidi([-1, 3, 2, 0, 1, 0]);

  it("is repeatable for the same seed", () => {
    expect(renderStrum(cMajor, SAMPLE_RATE, { seed: 7 })).toEqual(renderStrum(cMajor, SAMPLE_RATE, { seed: 7 }));
  });

  it("is normalised, finite and silent at the very end", () => {
    const signal = renderStrum(cMajor, SAMPLE_RATE);
    const peak = Math.max(...signal.map(Math.abs));
    expect(peak).toBeCloseTo(0.8, 5);
    expect(signal.every(Number.isFinite)).toBe(true);
    expect(signal[signal.length - 1]).toBe(0);
  });

  it("returns silence when every string is muted", () => {
    const signal = renderStrum([null, null, null, null, null, null], SAMPLE_RATE, { durationS: 0.5 });
    expect(signal.every((sample) => sample === 0)).toBe(true);
  });

  it("renders a six-string strum quickly enough to run on tap", () => {
    const start = performance.now();
    renderStrum(voicingToMidi([3, 2, 0, 0, 0, 3]), 48000);
    expect(performance.now() - start).toBeLessThan(250);
  });
});
