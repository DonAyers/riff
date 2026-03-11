import { Note } from "tonal";
import type { GuitarVoicing } from "./chordVoicings";

interface RelativeShape {
  stringOffsets: [number, number, number, number, number, number];
  fingers: [number, number, number, number, number, number];
  barreOffset: number | null;
}

const E_SHAPES: Record<string, RelativeShape> = {
  "major": { stringOffsets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1], barreOffset: 0 },
  "minor": { stringOffsets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1], barreOffset: 0 },
  "7":     { stringOffsets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1], barreOffset: 0 },
  "m7":    { stringOffsets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1], barreOffset: 0 },
  "maj7":  { stringOffsets: [0, -1, 1, 1, 0, -1], fingers: [1, 0, 3, 4, 2, 0], barreOffset: null }, // Drop 2 or generic maj7, omitting 5th and 1st strings
  "sus4":  { stringOffsets: [0, 2, 2, 2, 0, 0], fingers: [1, 3, 4, 4, 1, 1], barreOffset: 0 },
  "dim":   { stringOffsets: [0, -1, 2, 0, 1, -1], fingers: [1, 0, 3, 0, 2, 0], barreOffset: null }, // R, x, r(b5), m3, R. Just a common shell.
};

const A_SHAPES: Record<string, RelativeShape> = {
  "major": { stringOffsets: [-1, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1], barreOffset: 0 },
  "minor": { stringOffsets: [-1, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1], barreOffset: 0 },
  "7":     { stringOffsets: [-1, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1], barreOffset: 0 },
  "m7":    { stringOffsets: [-1, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1], barreOffset: 0 },
  "maj7":  { stringOffsets: [-1, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1], barreOffset: 0 },
  "sus2":  { stringOffsets: [-1, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 1, 1], barreOffset: 0 },
  "sus4":  { stringOffsets: [-1, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1], barreOffset: 0 },
  "dim":   { stringOffsets: [-1, 0, 1, 2, 1, -1], fingers: [0, 1, 2, 4, 3, 0], barreOffset: null },
  "aug":   { stringOffsets: [-1, 0, 3, 2, 2, -1], fingers: [0, 1, 4, 2, 3, 0], barreOffset: null },
};

export function generateDynamicVoicings(tonic: string, quality: string): GuitarVoicing[] {
  const voicings: GuitarVoicing[] = [];
  const chroma = Note.chroma(tonic);
  if (chroma === undefined || chroma === null) return voicings;

  // E string is E2 -> pitch class 4
  const eRootFret = (chroma - 4 + 12) % 12;
  // A string is A2 -> pitch class 9
  const aRootFret = (chroma - 9 + 12) % 12;

  // We normally don't play open string barres if they are just 0, unless user wants a 12th fret version, or it's genuinely open.
  // Actually, generating R=0 gives open chords which might clash with VOICINGS dictionary. 
  // We'll generate R=0 when suitable but also add R=12.
  
  const generate = (r: number, shape: RelativeShape): GuitarVoicing => {
    const frets = shape.stringOffsets.map(offset => (offset === -1 ? -1 : r + offset)) as [number, number, number, number, number, number];
    const barres = shape.barreOffset !== null && r > 0 ? [r + shape.barreOffset] : [];
    // baseFret is R, unless R is 0 in which case it's 1
    const baseFret = r > 0 ? r : 1;
    return { frets, fingers: shape.fingers, barres, baseFret };
  };

  const eShape = E_SHAPES[quality];
  if (eShape) {
    voicings.push(generate(eRootFret, eShape));
    if (eRootFret === 0) {
      voicings.push(generate(12, eShape)); // add octave barre
    }
  }

  const aShape = A_SHAPES[quality];
  if (aShape) {
    voicings.push(generate(aRootFret, aShape));
    if (aRootFret === 0) {
      voicings.push(generate(12, aShape)); // add octave barre
    }
  }

  return voicings;
}