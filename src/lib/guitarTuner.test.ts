import { describe, expect, it } from "vitest";
import {
  detectPitchYin,
  frequencyToNoteName,
  getTuningReading,
  STANDARD_GUITAR_STRINGS,
} from "./guitarTuner";

function sineWave(frequencyHz: number, sampleRate: number, seconds: number, gain = 0.8): Float32Array {
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * gain;
  }
  return samples;
}

describe("guitarTuner", () => {
  it("names detected frequencies with chromatic notes", () => {
    expect(frequencyToNoteName(440)).toBe("A4");
    expect(frequencyToNoteName(82.4069)).toBe("E2");
  });

  it("targets the nearest standard guitar string and cents offset", () => {
    const reading = getTuningReading({
      frequencyHz: 112,
      clarity: 0.96,
      rms: 0.4,
    });

    expect(reading.target).toEqual(STANDARD_GUITAR_STRINGS[1]);
    expect(reading.detectedNote).toBe("A2");
    expect(reading.cents).toBeGreaterThan(30);
    expect(reading.inTune).toBe(false);
  });

  it("marks a string in tune near the target pitch", () => {
    const reading = getTuningReading({
      frequencyHz: 110.1,
      clarity: 0.96,
      rms: 0.4,
    });

    expect(reading.target.note).toBe("A2");
    expect(reading.inTune).toBe(true);
  });

  it("detects a stable monophonic guitar pitch", () => {
    const sampleRate = 44100;
    const estimate = detectPitchYin(sineWave(110, sampleRate, 0.1), sampleRate);

    expect(estimate).not.toBeNull();
    expect(estimate?.frequencyHz).toBeCloseTo(110, 1);
    expect(estimate?.clarity).toBeGreaterThan(0.9);
  });

  it("ignores quiet input", () => {
    const sampleRate = 44100;
    const estimate = detectPitchYin(sineWave(110, sampleRate, 0.1, 0.001), sampleRate);

    expect(estimate).toBeNull();
  });
});
