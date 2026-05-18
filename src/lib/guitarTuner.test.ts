import { describe, expect, it } from "vitest";
import {
  createTuningStabilizer,
  detectPitchYin,
  frequencyToNoteName,
  getTuningReading,
  STANDARD_GUITAR_STRINGS,
  type TuningReading,
} from "./guitarTuner";

function sineWave(frequencyHz: number, sampleRate: number, seconds: number, gain = 0.8): Float32Array {
  const samples = new Float32Array(Math.floor(sampleRate * seconds));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * gain;
  }
  return samples;
}

function tuningReading(cents: number, target = STANDARD_GUITAR_STRINGS[1]): TuningReading {
  const frequencyHz = target.frequencyHz * 2 ** (cents / 1200);

  return {
    frequencyHz,
    detectedNote: target.note,
    target,
    cents,
    inTune: Math.abs(cents) <= 5,
    clarity: 0.98,
  };
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

  it("folds octave harmonic estimates back to the matching string", () => {
    const reading = getTuningReading({
      frequencyHz: 391.9954,
      clarity: 0.94,
      rms: 0.34,
    });

    expect(reading.target.note).toBe("G3");
    expect(reading.frequencyHz).toBeCloseTo(195.9977, 3);
    expect(reading.cents).toBeCloseTo(0, 1);
    expect(reading.inTune).toBe(true);
  });

  it("folds high-string octave harmonics back to B and high E", () => {
    const bReading = getTuningReading({
      frequencyHz: 493.8834,
      clarity: 0.94,
      rms: 0.34,
    });
    const eReading = getTuningReading({
      frequencyHz: 659.2552,
      clarity: 0.94,
      rms: 0.34,
    });

    expect(bReading.target.note).toBe("B3");
    expect(bReading.frequencyHz).toBeCloseTo(246.9417, 3);
    expect(eReading.target.note).toBe("E4");
    expect(eReading.frequencyHz).toBeCloseTo(329.6276, 3);
  });

  it("keeps ambiguous low-octave high E estimates on the low E harmonic", () => {
    const reading = getTuningReading({
      frequencyHz: 164.8138,
      clarity: 0.9,
      rms: 0.28,
    });

    expect(reading.target.note).toBe("E2");
    expect(reading.frequencyHz).toBeCloseTo(82.4069, 3);
    expect(reading.inTune).toBe(true);
  });

  it("prefers direct string matches over octave harmonic candidates", () => {
    const reading = getTuningReading({
      frequencyHz: 329.6276,
      clarity: 0.96,
      rms: 0.4,
    });

    expect(reading.target.note).toBe("E4");
    expect(reading.frequencyHz).toBeCloseTo(329.6276, 3);
  });

  it("detects a stable monophonic guitar pitch", () => {
    const sampleRate = 44100;
    const estimate = detectPitchYin(sineWave(110, sampleRate, 0.1), sampleRate);

    expect(estimate).not.toBeNull();
    expect(estimate?.frequencyHz).toBeCloseTo(110, 1);
    expect(estimate?.clarity).toBeGreaterThan(0.9);
  });

  it("smooths abrupt cents changes for the tuner display", () => {
    const stabilizer = createTuningStabilizer();

    const firstReading = stabilizer.update(tuningReading(30), 0);
    const secondReading = stabilizer.update(tuningReading(-30), 16);

    expect(firstReading?.cents).toBe(30);
    expect(secondReading?.cents).toBeGreaterThan(0);
    expect(secondReading?.cents).toBeLessThan(30);
  });

  it("resets smoothing when the player switches strings", () => {
    const stabilizer = createTuningStabilizer();

    stabilizer.update(tuningReading(30, STANDARD_GUITAR_STRINGS[1]), 0);
    const switchedReading = stabilizer.update(tuningReading(-24, STANDARD_GUITAR_STRINGS[0]), 16);

    expect(switchedReading?.target.note).toBe("E2");
    expect(switchedReading?.cents).toBeCloseTo(-24, 3);
  });

  it("holds the last stable reading across brief missing frames", () => {
    const stabilizer = createTuningStabilizer({ holdMissingMs: 100 });

    const stableReading = stabilizer.update(tuningReading(2), 1000);
    const heldReading = stabilizer.update(null, 1050);
    const expiredReading = stabilizer.update(null, 1150);

    expect(heldReading).toBe(stableReading);
    expect(expiredReading).toBeNull();
  });

  it("ignores quiet input", () => {
    const sampleRate = 44100;
    const estimate = detectPitchYin(sineWave(110, sampleRate, 0.1, 0.001), sampleRate);

    expect(estimate).toBeNull();
  });
});
