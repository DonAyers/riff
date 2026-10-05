import { PitchDetector } from "pitchy";

export interface GuitarStringTarget {
  id: string;
  label: string;
  note: string;
  frequencyHz: number;
  /** Guitar string number, 6 = lowest, 1 = highest. */
  stringNumber: number;
}

export interface TuningPreset {
  id: string;
  label: string;
  /** Open strings from low (6th) to high (1st). */
  strings: readonly { note: string; midi: number }[];
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
  /** True when the stabilizer is repeating the last reading because the string has gone quiet. */
  held?: boolean;
}

export interface TuningReadingOptions {
  strings?: readonly GuitarStringTarget[];
  lockedStringId?: string | null;
  inTuneThresholdCents?: number;
  a4Hz?: number;
}

export interface TuningStabilizerOptions {
  minCutoffHz?: number;
  beta?: number;
  derivativeCutoffHz?: number;
  holdMissingMs?: number;
  inTuneThresholdCents?: number;
  outOfTuneThresholdCents?: number;
  switchFrames?: number;
  freshSwitchMs?: number;
}

export interface TuningStabilizer {
  update: (reading: TuningReading | null, timestampMs: number) => TuningReading | null;
  reset: () => void;
}

export const DEFAULT_A4_HZ = 440;
export const MIN_A4_HZ = 430;
export const MAX_A4_HZ = 450;

export const TUNING_PRESETS: readonly TuningPreset[] = [
  {
    id: "standard",
    label: "Standard",
    strings: [
      { note: "E2", midi: 40 },
      { note: "A2", midi: 45 },
      { note: "D3", midi: 50 },
      { note: "G3", midi: 55 },
      { note: "B3", midi: 59 },
      { note: "E4", midi: 64 },
    ],
  },
  {
    id: "drop-d",
    label: "Drop D",
    strings: [
      { note: "D2", midi: 38 },
      { note: "A2", midi: 45 },
      { note: "D3", midi: 50 },
      { note: "G3", midi: 55 },
      { note: "B3", midi: 59 },
      { note: "E4", midi: 64 },
    ],
  },
  {
    id: "half-step-down",
    label: "Half step down",
    strings: [
      { note: "E♭2", midi: 39 },
      { note: "A♭2", midi: 44 },
      { note: "D♭3", midi: 49 },
      { note: "G♭3", midi: 54 },
      { note: "B♭3", midi: 58 },
      { note: "E♭4", midi: 63 },
    ],
  },
  {
    id: "dadgad",
    label: "DADGAD",
    strings: [
      { note: "D2", midi: 38 },
      { note: "A2", midi: 45 },
      { note: "D3", midi: 50 },
      { note: "G3", midi: 55 },
      { note: "A3", midi: 57 },
      { note: "D4", midi: 62 },
    ],
  },
  {
    id: "open-g",
    label: "Open G",
    strings: [
      { note: "D2", midi: 38 },
      { note: "G2", midi: 43 },
      { note: "D3", midi: 50 },
      { note: "G3", midi: 55 },
      { note: "B3", midi: 59 },
      { note: "D4", midi: 62 },
    ],
  },
  {
    id: "open-d",
    label: "Open D",
    strings: [
      { note: "D2", midi: 38 },
      { note: "A2", midi: 45 },
      { note: "D3", midi: 50 },
      { note: "F♯3", midi: 54 },
      { note: "A3", midi: 57 },
      { note: "D4", midi: 62 },
    ],
  },
] as const;

export const DEFAULT_TUNING_ID = TUNING_PRESETS[0].id;

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const A4_MIDI = 69;
const OCTAVE_HARMONIC_RATIOS = [1, 2] as const;
const LOCKED_OCTAVE_RATIOS = [0.5, 1, 2, 4] as const;
const OCTAVE_HARMONIC_PENALTY_CENTS = 12;
const DEFAULT_IN_TUNE_THRESHOLD_CENTS = 3;
const DEFAULT_OUT_OF_TUNE_THRESHOLD_CENTS = 5;
const DEFAULT_TUNING_STABILIZER_OPTIONS = {
  minCutoffHz: 2.8,
  beta: 0.012,
  derivativeCutoffHz: 1,
  holdMissingMs: 1500,
  inTuneThresholdCents: DEFAULT_IN_TUNE_THRESHOLD_CENTS,
  outOfTuneThresholdCents: DEFAULT_OUT_OF_TUNE_THRESHOLD_CENTS,
  switchFrames: 3,
  freshSwitchMs: 250,
} satisfies Required<TuningStabilizerOptions>;

export function midiToFrequency(midi: number, a4Hz = DEFAULT_A4_HZ): number {
  return a4Hz * 2 ** ((midi - A4_MIDI) / 12);
}

export function frequencyToMidi(frequencyHz: number, a4Hz = DEFAULT_A4_HZ): number {
  return A4_MIDI + 12 * Math.log2(frequencyHz / a4Hz);
}

export function frequencyToNoteName(frequencyHz: number, a4Hz = DEFAULT_A4_HZ): string {
  const midi = Math.round(frequencyToMidi(frequencyHz, a4Hz));
  const noteName = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${noteName}${octave}`;
}

export function centsBetween(frequencyHz: number, targetFrequencyHz: number): number {
  return 1200 * Math.log2(frequencyHz / targetFrequencyHz);
}

export function getTuningPreset(tuningId: string): TuningPreset {
  return TUNING_PRESETS.find((preset) => preset.id === tuningId) ?? TUNING_PRESETS[0];
}

function pitchClassOf(note: string): string {
  return note.replace(/-?\d+$/, "");
}

function noteToId(note: string): string {
  return note.toLowerCase().replace("♭", "b").replace("♯", "s");
}

export function buildStringTargets(
  preset: TuningPreset,
  a4Hz = DEFAULT_A4_HZ
): GuitarStringTarget[] {
  const lastIndex = preset.strings.length - 1;

  return preset.strings.map(({ note, midi }, index) => {
    const pitchClass = pitchClassOf(note);
    const sameClassIndexes = preset.strings
      .map((string, stringIndex) => (pitchClassOf(string.note) === pitchClass ? stringIndex : -1))
      .filter((stringIndex) => stringIndex >= 0);
    let label = pitchClass;

    if (sameClassIndexes.length > 1) {
      if (index === sameClassIndexes[0]) {
        label = `Low ${pitchClass}`;
      } else if (index === sameClassIndexes[sameClassIndexes.length - 1]) {
        label = `High ${pitchClass}`;
      }
    }

    return {
      id: noteToId(note),
      label,
      note,
      frequencyHz: midiToFrequency(midi, a4Hz),
      stringNumber: lastIndex - index + 1,
    };
  });
}

export const STANDARD_GUITAR_STRINGS: readonly GuitarStringTarget[] = buildStringTargets(
  TUNING_PRESETS[0]
);

export function getTuningReading(
  estimate: PitchEstimate,
  options: TuningReadingOptions = {}
): TuningReading {
  const strings = options.strings ?? STANDARD_GUITAR_STRINGS;
  const inTuneThresholdCents = options.inTuneThresholdCents ?? DEFAULT_IN_TUNE_THRESHOLD_CENTS;
  const a4Hz = options.a4Hz ?? DEFAULT_A4_HZ;
  const lockedString = options.lockedStringId
    ? strings.find((string) => string.id === options.lockedStringId)
    : undefined;
  let target = lockedString ?? strings[0];
  let frequencyHz = estimate.frequencyHz;
  let cents = centsBetween(frequencyHz, target.frequencyHz);
  let score = Number.POSITIVE_INFINITY;

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

  if (lockedString) {
    // A locked string means the player told us which string they are tuning, so any
    // octave error from the detector can be folded onto that string without penalty.
    for (const ratio of LOCKED_OCTAVE_RATIOS) {
      considerCandidate(lockedString, estimate.frequencyHz / ratio, 0);
    }
  } else {
    for (const candidate of strings) {
      for (const harmonicRatio of OCTAVE_HARMONIC_RATIOS) {
        considerCandidate(
          candidate,
          estimate.frequencyHz / harmonicRatio,
          harmonicRatio === 1 ? 0 : OCTAVE_HARMONIC_PENALTY_CENTS
        );
      }
    }
  }

  return {
    frequencyHz,
    detectedNote: frequencyToNoteName(frequencyHz, a4Hz),
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
  let wasInTune = false;
  let pendingTargetId: string | null = null;
  let pendingTargetFrames = 0;

  function holdLastReading(): TuningReading | null {
    if (!lastReading) {
      return null;
    }

    return lastReading.held ? lastReading : { ...lastReading, held: true };
  }

  return {
    update(reading, timestampMs) {
      if (!reading) {
        pendingTargetId = null;
        pendingTargetFrames = 0;

        if (
          lastReading &&
          timestampMs - lastReadingTimestampMs <= resolvedOptions.holdMissingMs
        ) {
          lastReading = holdLastReading();
          return lastReading;
        }

        this.reset();
        return null;
      }

      const isTargetChange = lastTargetId !== null && reading.target.id !== lastTargetId;
      const lastReadingIsFresh =
        lastReading !== null &&
        timestampMs - lastReadingTimestampMs <= resolvedOptions.freshSwitchMs;

      // Per-string hysteresis: while a string is ringing, only switch targets once the new
      // string has won several frames in a row. A brand-new pluck after silence switches at once.
      if (isTargetChange && lastReadingIsFresh) {
        if (pendingTargetId === reading.target.id) {
          pendingTargetFrames += 1;
        } else {
          pendingTargetId = reading.target.id;
          pendingTargetFrames = 1;
        }

        if (pendingTargetFrames < resolvedOptions.switchFrames) {
          return lastReading;
        }
      }

      pendingTargetId = null;
      pendingTargetFrames = 0;

      if (reading.target.id !== lastTargetId) {
        centsFilter.reset();
        wasInTune = false;
      }

      const smoothedCents = centsFilter.filter(reading.cents, timestampMs);
      const frequencyHz = reading.target.frequencyHz * 2 ** (smoothedCents / 1200);
      const inTuneLimit = wasInTune
        ? resolvedOptions.outOfTuneThresholdCents
        : resolvedOptions.inTuneThresholdCents;
      const inTune = Math.abs(smoothedCents) <= inTuneLimit;
      const smoothedReading: TuningReading = {
        ...reading,
        frequencyHz,
        cents: smoothedCents,
        inTune,
        held: false,
      };

      wasInTune = inTune;
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
      wasInTune = false;
      pendingTargetId = null;
      pendingTargetFrames = 0;
    },
  };
}

export interface PitchDetectorOptions {
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  minClarity?: number;
  minRms?: number;
}

export type GuitarPitchDetector = (
  samples: Float32Array,
  sampleRate: number
) => PitchEstimate | null;

/**
 * Creates a McLeod Pitch Method detector (via pitchy) for fixed-size frames.
 * MPM picks the first strong NSDF peak instead of the global one, which keeps it on the
 * fundamental of a plucked string even when the 2nd harmonic is louder.
 */
export function createPitchDetector(
  inputLength: number,
  options: PitchDetectorOptions = {}
): GuitarPitchDetector {
  const minFrequencyHz = options.minFrequencyHz ?? 60;
  const maxFrequencyHz = options.maxFrequencyHz ?? 720;
  const minClarity = options.minClarity ?? 0.9;
  const minRms = options.minRms ?? 0.01;
  const detector = PitchDetector.forFloat32Array(inputLength);

  return (samples, sampleRate) => {
    if (samples.length !== inputLength || sampleRate <= 0) {
      return null;
    }

    let energy = 0;
    for (let i = 0; i < samples.length; i += 1) {
      energy += samples[i] * samples[i];
    }

    // Gate on RMS ourselves: pitchy's minVolumeDecibels converts with 10^(dB/10), a power
    // ratio, so its decibel threshold does not match an amplitude dBFS reading.
    const rms = Math.sqrt(energy / samples.length);
    if (rms < minRms) {
      return null;
    }

    const [frequencyHz, clarity] = detector.findPitch(samples, sampleRate);
    if (
      !Number.isFinite(frequencyHz) ||
      clarity < minClarity ||
      frequencyHz < minFrequencyHz ||
      frequencyHz > maxFrequencyHz
    ) {
      return null;
    }

    return { frequencyHz, clarity, rms };
  };
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
