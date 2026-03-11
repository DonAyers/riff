import { Chord } from "tonal";

export interface GuitarVoicing {
  frets: [number, number, number, number, number, number];
  fingers: [number, number, number, number, number, number];
  barres: number[];
  baseFret: number;
}

type VoicingDictionary = Record<string, GuitarVoicing[]>;

const VOICINGS: VoicingDictionary = {
  "C:major": [
    { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], barres: [], baseFret: 1 },
    { frets: [8, 10, 10, 9, 8, 8], fingers: [1, 3, 4, 2, 1, 1], barres: [8], baseFret: 8 },
  ],
  "A:minor": [
    { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], barres: [], baseFret: 1 },
    { frets: [5, 7, 7, 5, 5, 5], fingers: [1, 3, 4, 1, 1, 1], barres: [5], baseFret: 5 },
  ],
  "G:major": [
    { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], barres: [], baseFret: 1 },
    { frets: [3, 5, 5, 4, 3, 3], fingers: [1, 3, 4, 2, 1, 1], barres: [3], baseFret: 3 },
  ],
  "D:major": [
    { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], barres: [], baseFret: 1 },
  ],
  "E:major": [
    { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], barres: [], baseFret: 1 },
    { frets: [12, 14, 14, 13, 12, 12], fingers: [1, 3, 4, 2, 1, 1], barres: [12], baseFret: 12 },
  ],
  "F:major": [
    { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barres: [1], baseFret: 1 },
  ],
  "E:minor": [
    { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], barres: [], baseFret: 1 },
    { frets: [0, 7, 9, 9, 8, 7], fingers: [0, 1, 3, 4, 2, 1], barres: [7], baseFret: 7 },
  ],
  "G:7": [
    { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], barres: [], baseFret: 1 },
    { frets: [3, 5, 3, 4, 3, 3], fingers: [1, 3, 1, 2, 1, 1], barres: [3], baseFret: 3 },
  ],
};

function normalizeLabelChordName(chordName: string) {
  const trimmed = chordName.trim();
  const labelMatch = trimmed.match(/^([A-G](?:#|b)?)[\s-]+(.+)$/);

  if (!labelMatch) {
    return trimmed;
  }

  const [, tonic, qualityLabel] = labelMatch;
  const quality = qualityLabel.toLowerCase();

  if (quality === "major") return `${tonic}M`;
  if (quality === "minor") return `${tonic}m`;
  if (quality === "diminished") return `${tonic}dim`;
  if (quality === "augmented") return `${tonic}aug`;
  if (quality === "7") return `${tonic}7`;
  if (quality === "maj7") return `${tonic}maj7`;
  if (quality === "m7") return `${tonic}m7`;

  return trimmed;
}

function toDictionaryKey(chordName: string) {
  const normalizedInput = normalizeLabelChordName(chordName);
  const chord = Chord.get(normalizedInput);

  if (chord.empty || !chord.tonic) {
    return null;
  }

  const aliases = chord.aliases.map((alias) => alias.toLowerCase());
  let quality = "major";

  if (normalizedInput.endsWith("maj7") || aliases.includes("maj7")) quality = "maj7";
  else if (normalizedInput.endsWith("m7") || aliases.includes("m7")) quality = "m7";
  else if (normalizedInput.endsWith("7") || aliases.includes("7")) quality = "7";
  else if (chord.quality === "Minor") quality = "minor";
  else if (chord.quality === "Diminished") quality = "dim";
  else if (chord.quality === "Augmented") quality = "aug";
  else if (aliases.includes("sus2")) quality = "sus2";
  else if (aliases.includes("sus4") || aliases.includes("sus")) quality = "sus4";

  return `${chord.tonic}:${quality}`;
}

export function lookupVoicings(chordName: string | null): GuitarVoicing[] {
  if (!chordName) return [];

  const key = toDictionaryKey(chordName);
  if (!key) return [];

  return VOICINGS[key] ?? [];
}