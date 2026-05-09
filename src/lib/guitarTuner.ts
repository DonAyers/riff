export interface GuitarStringTarget {
  id: string;
  label: string;
  note: string;
  frequencyHz: number;
}

export interface PitchEstimate {
  frequencyHz: number;
  clarity: number;
  rms: number;
}

export interface TuningReading {
  frequencyHz: number;
  detectedNote: string;
  target: GuitarStringTarget;
  cents: number;
  inTune: boolean;
  clarity: number;
}

export const STANDARD_GUITAR_STRINGS: readonly GuitarStringTarget[] = [
  { id: "e2", label: "Low E", note: "E2", frequencyHz: 82.4069 },
  { id: "a2", label: "A", note: "A2", frequencyHz: 110 },
  { id: "d3", label: "D", note: "D3", frequencyHz: 146.8324 },
  { id: "g3", label: "G", note: "G3", frequencyHz: 195.9977 },
  { id: "b3", label: "B", note: "B3", frequencyHz: 246.9417 },
  { id: "e4", label: "High E", note: "E4", frequencyHz: 329.6276 },
] as const;

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const A4_MIDI = 69;
const A4_FREQUENCY_HZ = 440;

export function frequencyToMidi(frequencyHz: number): number {
  return A4_MIDI + 12 * Math.log2(frequencyHz / A4_FREQUENCY_HZ);
}

export function frequencyToNoteName(frequencyHz: number): string {
  const midi = Math.round(frequencyToMidi(frequencyHz));
  const noteName = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${noteName}${octave}`;
}

export function centsBetween(frequencyHz: number, targetFrequencyHz: number): number {
  return 1200 * Math.log2(frequencyHz / targetFrequencyHz);
}

export function getTuningReading(
  estimate: PitchEstimate,
  inTuneThresholdCents = 5
): TuningReading {
  let target = STANDARD_GUITAR_STRINGS[0];
  let cents = centsBetween(estimate.frequencyHz, target.frequencyHz);

  for (const candidate of STANDARD_GUITAR_STRINGS.slice(1)) {
    const candidateCents = centsBetween(estimate.frequencyHz, candidate.frequencyHz);
    if (Math.abs(candidateCents) < Math.abs(cents)) {
      target = candidate;
      cents = candidateCents;
    }
  }

  return {
    frequencyHz: estimate.frequencyHz,
    detectedNote: frequencyToNoteName(estimate.frequencyHz),
    target,
    cents,
    inTune: Math.abs(cents) <= inTuneThresholdCents,
    clarity: estimate.clarity,
  };
}

interface DetectPitchOptions {
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  threshold?: number;
  minRms?: number;
}

export function detectPitchYin(
  samples: Float32Array,
  sampleRate: number,
  options: DetectPitchOptions = {}
): PitchEstimate | null {
  const minFrequencyHz = options.minFrequencyHz ?? 70;
  const maxFrequencyHz = options.maxFrequencyHz ?? 420;
  const threshold = options.threshold ?? 0.12;
  const minRms = options.minRms ?? 0.015;
  const sampleCount = samples.length;

  if (sampleCount < 2 || sampleRate <= 0) {
    return null;
  }

  let energy = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    energy += samples[i] * samples[i];
  }

  const rms = Math.sqrt(energy / sampleCount);
  if (rms < minRms) {
    return null;
  }

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequencyHz));
  const tauMax = Math.min(sampleCount - 1, Math.ceil(sampleRate / minFrequencyHz));
  if (tauMin >= tauMax) {
    return null;
  }

  const difference = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau += 1) {
    let sum = 0;
    const comparisonLength = sampleCount - tau;
    for (let i = 0; i < comparisonLength; i += 1) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }

  let runningSum = 0;
  let bestTau = -1;
  let bestValue = Number.POSITIVE_INFINITY;

  for (let tau = 1; tau <= tauMax; tau += 1) {
    runningSum += difference[tau];
    if (runningSum === 0) {
      continue;
    }

    const value = (difference[tau] * tau) / runningSum;
    difference[tau] = value;

    if (tau >= tauMin && value < bestValue) {
      bestTau = tau;
      bestValue = value;
    }
  }

  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    let value = difference[tau];
    if (value < threshold) {
      while (tau + 1 <= tauMax && difference[tau + 1] < value) {
        tau += 1;
        value = difference[tau];
      }
      bestTau = tau;
      bestValue = value;
      break;
    }
  }

  if (bestTau < 0 || bestValue > 0.3) {
    return null;
  }

  const refinedTau = refineTauWithParabolicInterpolation(difference, bestTau);
  return {
    frequencyHz: sampleRate / refinedTau,
    clarity: Math.max(0, Math.min(1, 1 - bestValue)),
    rms,
  };
}

function refineTauWithParabolicInterpolation(values: Float32Array, tau: number): number {
  if (tau <= 1 || tau >= values.length - 1) {
    return tau;
  }

  const previous = values[tau - 1];
  const current = values[tau];
  const next = values[tau + 1];
  const denominator = previous + next - 2 * current;

  if (Math.abs(denominator) < Number.EPSILON) {
    return tau;
  }

  return tau + (previous - next) / (2 * denominator);
}
