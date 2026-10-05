import { describe, expect, it } from "vitest";
import {
  createTuningStabilizer,
  buildStringTargets,
  createPitchDetector,
  frequencyToNoteName,
  getTuningPreset,
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
    inTune: Math.abs(cents) <= 3,
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
    const detect = createPitchDetector(4096);
    const estimate = detect(sineWave(110, sampleRate, 4096 / sampleRate), sampleRate);

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
    stabilizer.update(tuningReading(-24, STANDARD_GUITAR_STRINGS[0]), 16);
    stabilizer.update(tuningReading(-24, STANDARD_GUITAR_STRINGS[0]), 32);
    const switchedReading = stabilizer.update(tuningReading(-24, STANDARD_GUITAR_STRINGS[0]), 48);

    expect(switchedReading?.target.note).toBe("E2");
    expect(switchedReading?.cents).toBeCloseTo(-24, 3);
  });

  it("holds the last stable reading across brief missing frames", () => {
    const stabilizer = createTuningStabilizer({ holdMissingMs: 100 });

    const stableReading = stabilizer.update(tuningReading(2), 1000);
    const heldReading = stabilizer.update(null, 1050);
    const expiredReading = stabilizer.update(null, 1150);

    expect(heldReading).toEqual({ ...stableReading, held: true });
    expect(expiredReading).toBeNull();
  });

  it("ignores quiet input", () => {
    const sampleRate = 44100;
    const detect = createPitchDetector(4096);
    const estimate = detect(sineWave(110, sampleRate, 4096 / sampleRate, 0.001), sampleRate);

    expect(estimate).toBeNull();
  });

  it("finds the fundamental of a plucked string with a louder second harmonic", () => {
    const sampleRate = 48000;
    const samples = new Float32Array(4096);
    for (let i = 0; i < samples.length; i += 1) {
      const t = i / sampleRate;
      samples[i] =
        0.06 * Math.sin(2 * Math.PI * 82.4069 * t) +
        0.3 * Math.sin(2 * Math.PI * 164.8138 * t + 1) +
        0.18 * Math.sin(2 * Math.PI * 247.2207 * t + 2);
    }

    const estimate = createPitchDetector(4096)(samples, sampleRate);

    expect(estimate?.frequencyHz).toBeCloseTo(82.4069, 0);
  });

  it("rejects frames of the wrong length or out of range pitches", () => {
    const detect = createPitchDetector(4096, { maxFrequencyHz: 400 });

    expect(detect(sineWave(110, 44100, 0.05), 44100)).toBeNull();
    expect(detect(sineWave(880, 44100, 4096 / 44100), 44100)).toBeNull();
  });

  it("builds string targets for alternate tunings and reference pitches", () => {
    const dropD = buildStringTargets(getTuningPreset("drop-d"));
    const dadgad = buildStringTargets(getTuningPreset("dadgad"));
    const standard432 = buildStringTargets(getTuningPreset("standard"), 432);

    expect(dropD[0]).toMatchObject({ note: "D2", stringNumber: 6 });
    expect(dropD[0].frequencyHz).toBeCloseTo(73.4162, 3);
    expect(dadgad.map((string) => string.label)).toEqual([
      "Low D",
      "Low A",
      "D",
      "G",
      "High A",
      "High D",
    ]);
    expect(new Set(dadgad.map((string) => string.id)).size).toBe(6);
    expect(standard432[1].frequencyHz).toBeCloseTo(108, 3);
    expect(getTuningPreset("missing").id).toBe("standard");
  });

  it("targets drop D low string instead of standard low E", () => {
    const reading = getTuningReading(
      { frequencyHz: 73.8, clarity: 0.95, rms: 0.2 },
      { strings: buildStringTargets(getTuningPreset("drop-d")) }
    );

    expect(reading.target.note).toBe("D2");
    expect(reading.cents).toBeGreaterThan(5);
  });

  it("measures against a locked string and folds octave errors onto it", () => {
    const reading = getTuningReading(
      { frequencyHz: 164.0, clarity: 0.95, rms: 0.2 },
      { lockedStringId: "e2" }
    );
    const farReading = getTuningReading(
      { frequencyHz: 100, clarity: 0.95, rms: 0.2 },
      { lockedStringId: "a2" }
    );

    expect(reading.target.id).toBe("e2");
    expect(reading.frequencyHz).toBeCloseTo(82, 3);
    expect(reading.cents).toBeLessThan(0);
    expect(farReading.target.id).toBe("a2");
    expect(farReading.cents).toBeLessThan(-100);
  });

  it("uses tighter enter and looser exit thresholds for in-tune feedback", () => {
    const stabilizer = createTuningStabilizer({ minCutoffHz: 1000 });

    expect(stabilizer.update(tuningReading(4), 0)?.inTune).toBe(false);
    expect(stabilizer.update(tuningReading(2.5), 16)?.inTune).toBe(true);
    expect(stabilizer.update(tuningReading(4.5), 32)?.inTune).toBe(true);
    expect(stabilizer.update(tuningReading(6), 48)?.inTune).toBe(false);
  });

  it("ignores a single-frame jump to another string while a note rings", () => {
    const stabilizer = createTuningStabilizer();

    stabilizer.update(tuningReading(1, STANDARD_GUITAR_STRINGS[1]), 0);
    const blip = stabilizer.update(tuningReading(0, STANDARD_GUITAR_STRINGS[2]), 16);
    const back = stabilizer.update(tuningReading(1, STANDARD_GUITAR_STRINGS[1]), 32);

    expect(blip?.target.id).toBe("a2");
    expect(back?.target.id).toBe("a2");
  });

  it("switches strings at once when a new string is plucked after silence", () => {
    const stabilizer = createTuningStabilizer();

    stabilizer.update(tuningReading(1, STANDARD_GUITAR_STRINGS[1]), 0);
    stabilizer.update(null, 300);
    const next = stabilizer.update(tuningReading(0, STANDARD_GUITAR_STRINGS[2]), 400);

    expect(next?.target.id).toBe("d3");
    expect(next?.held).toBe(false);
  });

  it("keeps the note name consistent with the smoothed frequency and A4 reference", () => {
    const strings432 = buildStringTargets(getTuningPreset("standard"), 432);
    const raw = getTuningReading({ frequencyHz: 109.5, clarity: 0.95, rms: 0.2 }, {
      strings: strings432,
      a4Hz: 432,
    });
    const stabilizer = createTuningStabilizer();
    const reading = stabilizer.update(raw, 0);

    expect(raw.detectedNote).toBe("A2");
    expect(reading?.detectedNote).toBe("A2");

    // Smoothing that drags a reading across a note boundary must rename it too.
    const sharp = getTuningReading({ frequencyHz: 114.5, clarity: 0.95, rms: 0.2 });
    const slow = createTuningStabilizer({ minCutoffHz: 0.01, beta: 0 });
    slow.update(getTuningReading({ frequencyHz: 107, clarity: 0.95, rms: 0.2 }), 0);
    const smoothed = slow.update(sharp, 16);

    expect(sharp.detectedNote).toBe("A♯2");
    expect(smoothed?.detectedNote).toBe(frequencyToNoteName(smoothed!.frequencyHz));
    expect(smoothed?.detectedNote).toBe("A2");
  });
});
