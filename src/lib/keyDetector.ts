import { Note } from "tonal";
import type { MappedNote } from "./noteMapper";

export interface KeyResult {
  key: string;
  mode: "major" | "minor";
  label: string;
  confidence: number;
  correlation: number;
}

export interface KeyDetection {
  primary: KeyResult | null;
  alternatives: KeyResult[];
  ranked: KeyResult[];
  lowConfidence: boolean;
}

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const TONICS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MIN_CONFIDENT_PITCH_CLASSES = 5;
const MIN_CORRELATION = 0.5;

function rotateProfile(profile: number[], steps: number) {
  const offset = ((steps % profile.length) + profile.length) % profile.length;
  return profile.map((_, index) => profile[(index - offset + profile.length) % profile.length]);
}

function pearsonCorrelation(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return 0;

  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;

  let numerator = 0;
  let leftDenominator = 0;
  let rightDenominator = 0;

  for (let index = 0; index < left.length; index++) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftDenominator += leftDelta * leftDelta;
    rightDenominator += rightDelta * rightDelta;
  }

  if (leftDenominator === 0 || rightDenominator === 0) return 0;
  return numerator / Math.sqrt(leftDenominator * rightDenominator);
}

function toConfidence(correlation: number) {
  return Math.max(0, Math.min(1, (correlation + 1) / 2));
}

export function buildPitchClassHistogram(notes: MappedNote[]) {
  const histogram = Array.from({ length: 12 }, () => 0);

  for (const note of notes) {
    const chroma = Note.chroma(note.pitchClass);
    if (chroma === null) continue;
    histogram[chroma] += 1;
  }

  return histogram;
}

export function detectKey(notes: MappedNote[]): KeyDetection {
  const histogram = buildPitchClassHistogram(notes);
  const distinctPitchClasses = histogram.filter((value) => value > 0).length;

  if (distinctPitchClasses === 0) {
    return {
      primary: null,
      alternatives: [],
      ranked: [],
      lowConfidence: true,
    };
  }

  const ranked = TONICS.flatMap((tonic, index) => {
    const majorCorrelation = pearsonCorrelation(histogram, rotateProfile(MAJOR_PROFILE, index));
    const minorCorrelation = pearsonCorrelation(histogram, rotateProfile(MINOR_PROFILE, index));

    return [
      {
        key: tonic,
        mode: "major" as const,
        label: `${tonic} Major`,
        confidence: toConfidence(majorCorrelation),
        correlation: majorCorrelation,
      },
      {
        key: tonic,
        mode: "minor" as const,
        label: `${tonic} Minor`,
        confidence: toConfidence(minorCorrelation),
        correlation: minorCorrelation,
      },
    ];
  }).sort((left, right) => right.correlation - left.correlation);

  const primary = ranked[0] ?? null;

  return {
    primary,
    alternatives: ranked.slice(1, 3),
    ranked,
    lowConfidence: distinctPitchClasses < MIN_CONFIDENT_PITCH_CLASSES || (primary?.correlation ?? 0) < MIN_CORRELATION,
  };
}