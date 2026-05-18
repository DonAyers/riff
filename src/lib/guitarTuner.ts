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

export interface TuningStabilizerOptions {
  minCutoffHz?: number;
  beta?: number;
  derivativeCutoffHz?: number;
  holdMissingMs?: number;
  inTuneThresholdCents?: number;
}

export interface TuningStabilizer {
  update: (reading: TuningReading | null, timestampMs: number) => TuningReading | null;
  reset: () => void;
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
const OCTAVE_HARMONIC_RATIOS = [1, 2] as const;
const OCTAVE_HARMONIC_PENALTY_CENTS = 12;
const DEFAULT_IN_TUNE_THRESHOLD_CENTS = 5;
const DEFAULT_TUNING_STABILIZER_OPTIONS = {
  minCutoffHz: 2.8,
  beta: 0.012,
  derivativeCutoffHz: 1,
  holdMissingMs: 160,
  inTuneThresholdCents: DEFAULT_IN_TUNE_THRESHOLD_CENTS,
} satisfies Required<TuningStabilizerOptions>;

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
  inTuneThresholdCents = DEFAULT_IN_TUNE_THRESHOLD_CENTS
): TuningReading {
  let target = STANDARD_GUITAR_STRINGS[0];
  let frequencyHz = estimate.frequencyHz;
  let cents = centsBetween(frequencyHz, target.frequencyHz);
  let score = Math.abs(cents);

  function considerCandidate(
    candidate: GuitarStringTarget,
    candidateFrequencyHz: number,
    penaltyCents: number
  ) {
    const candidateCents = centsBetween(candidateFrequencyHz, candidate.frequencyHz);
    const candidateScore = Math.abs(candidateCents) + penaltyCents;

    if (candidateScore < score) {
      target = candidate;
      frequencyHz = candidateFrequencyHz;
      cents = candidateCents;
      score = candidateScore;
    }
  }

  for (const candidate of STANDARD_GUITAR_STRINGS) {
    for (const harmonicRatio of OCTAVE_HARMONIC_RATIOS) {
      considerCandidate(
        candidate,
        estimate.frequencyHz / harmonicRatio,
        harmonicRatio === 1 ? 0 : OCTAVE_HARMONIC_PENALTY_CENTS
      );
    }
  }

  return {
    frequencyHz,
    detectedNote: frequencyToNoteName(frequencyHz),
    target,
    cents,
    inTune: Math.abs(cents) <= inTuneThresholdCents,
    clarity: estimate.clarity,
  };
}

export function createTuningStabilizer(options: TuningStabilizerOptions = {}): TuningStabilizer {
  const resolvedOptions = {
    ...DEFAULT_TUNING_STABILIZER_OPTIONS,
    ...options,
  };
  const centsFilter = new OneEuroFilter(
    resolvedOptions.minCutoffHz,
    resolvedOptions.beta,
    resolvedOptions.derivativeCutoffHz
  );
  let lastReading: TuningReading | null = null;
  let lastReadingTimestampMs = 0;
  let lastTargetId: string | null = null;

  return {
    update(reading, timestampMs) {
      if (!reading) {
        if (
          lastReading &&
          timestampMs - lastReadingTimestampMs <= resolvedOptions.holdMissingMs
        ) {
          return lastReading;
        }

        this.reset();
        return null;
      }

      if (reading.target.id !== lastTargetId) {
        centsFilter.reset();
      }

      const smoothedCents = centsFilter.filter(reading.cents, timestampMs);
      const frequencyHz = reading.target.frequencyHz * 2 ** (smoothedCents / 1200);
      const smoothedReading: TuningReading = {
        ...reading,
        frequencyHz,
        detectedNote: frequencyToNoteName(frequencyHz),
        cents: smoothedCents,
        inTune: Math.abs(smoothedCents) <= resolvedOptions.inTuneThresholdCents,
      };

      lastReading = smoothedReading;
      lastReadingTimestampMs = timestampMs;
      lastTargetId = reading.target.id;
      return smoothedReading;
    },
    reset() {
      centsFilter.reset();
      lastReading = null;
      lastReadingTimestampMs = 0;
      lastTargetId = null;
    },
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

class OneEuroFilter {
  private readonly valueFilter = new LowPassFilter();
  private readonly derivativeFilter = new LowPassFilter();
  private previousRawValue: number | null = null;
  private previousTimestampMs: number | null = null;

  constructor(
    private readonly minCutoffHz: number,
    private readonly beta: number,
    private readonly derivativeCutoffHz: number
  ) {}

  filter(value: number, timestampMs: number): number {
    const previousRawValue = this.previousRawValue;
    const previousTimestampMs = this.previousTimestampMs;
    this.previousRawValue = value;
    this.previousTimestampMs = timestampMs;

    if (previousRawValue === null || previousTimestampMs === null) {
      this.valueFilter.reset(value);
      this.derivativeFilter.reset(0);
      return value;
    }

    const elapsedSeconds = Math.max((timestampMs - previousTimestampMs) / 1000, 1 / 120);
    const derivative = (value - previousRawValue) / elapsedSeconds;
    const smoothedDerivative = this.derivativeFilter.filter(
      derivative,
      smoothingFactor(this.derivativeCutoffHz, elapsedSeconds)
    );
    const cutoffHz = this.minCutoffHz + this.beta * Math.abs(smoothedDerivative);

    return this.valueFilter.filter(value, smoothingFactor(cutoffHz, elapsedSeconds));
  }

  reset() {
    this.valueFilter.reset();
    this.derivativeFilter.reset();
    this.previousRawValue = null;
    this.previousTimestampMs = null;
  }
}

class LowPassFilter {
  private initialized = false;
  private previousValue = 0;

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.reset(value);
      return value;
    }

    this.previousValue = alpha * value + (1 - alpha) * this.previousValue;
    return this.previousValue;
  }

  reset(value?: number) {
    this.initialized = value !== undefined;
    this.previousValue = value ?? 0;
  }
}

function smoothingFactor(cutoffHz: number, elapsedSeconds: number): number {
  const rate = 2 * Math.PI * Math.max(0, cutoffHz) * elapsedSeconds;
  return rate / (rate + 1);
}
