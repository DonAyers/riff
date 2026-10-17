/**
 * Labelled guitar chords for the chord-detection benchmark.
 * Frets run low string to high string (-1 = muted), like GuitarVoicing.frets.
 * `chord` is the expected tonal symbol; slash chords name the bass.
 */
export interface ChordCase {
  name: string;
  chord: string;
  frets: number[];
  tuning?: TuningName;
}

export type TuningName = "standard" | "drop-d" | "half-step-down" | "dadgad";

export const TUNINGS: Record<TuningName, number[]> = {
  standard: [40, 45, 50, 55, 59, 64],
  "drop-d": [38, 45, 50, 55, 59, 64],
  "half-step-down": [39, 44, 49, 54, 58, 63],
  dadgad: [38, 45, 50, 55, 57, 62],
};

export const CHORD_CASES: ChordCase[] = [
  // Open major / minor
  { name: "open C", chord: "C", frets: [-1, 3, 2, 0, 1, 0] },
  { name: "open A", chord: "A", frets: [-1, 0, 2, 2, 2, 0] },
  { name: "open G", chord: "G", frets: [3, 2, 0, 0, 0, 3] },
  { name: "open E", chord: "E", frets: [0, 2, 2, 1, 0, 0] },
  { name: "open D", chord: "D", frets: [-1, -1, 0, 2, 3, 2] },
  { name: "open Am", chord: "Am", frets: [-1, 0, 2, 2, 1, 0] },
  { name: "open Em", chord: "Em", frets: [0, 2, 2, 0, 0, 0] },
  { name: "open Dm", chord: "Dm", frets: [-1, -1, 0, 2, 3, 1] },
  // Sevenths and colours
  { name: "open G7", chord: "G7", frets: [3, 2, 0, 0, 0, 1] },
  { name: "open C7", chord: "C7", frets: [-1, 3, 2, 3, 1, 0] },
  { name: "open A7", chord: "A7", frets: [-1, 0, 2, 0, 2, 0] },
  { name: "open D7", chord: "D7", frets: [-1, -1, 0, 2, 1, 2] },
  { name: "open E7", chord: "E7", frets: [0, 2, 0, 1, 0, 0] },
  { name: "open B7", chord: "B7", frets: [-1, 2, 1, 2, 0, 2] },
  { name: "open Am7", chord: "Am7", frets: [-1, 0, 2, 0, 1, 0] },
  { name: "open Em7", chord: "Em7", frets: [0, 2, 0, 0, 0, 0] },
  { name: "open Dm7", chord: "Dm7", frets: [-1, -1, 0, 2, 1, 1] },
  { name: "open Cmaj7", chord: "Cmaj7", frets: [-1, 3, 2, 0, 0, 0] },
  { name: "open Fmaj7", chord: "Fmaj7", frets: [-1, -1, 3, 2, 1, 0] },
  { name: "open Dmaj7", chord: "Dmaj7", frets: [-1, -1, 0, 2, 2, 2] },
  { name: "open Asus2", chord: "Asus2", frets: [-1, 0, 2, 2, 0, 0] },
  { name: "open Asus4", chord: "Asus4", frets: [-1, 0, 2, 2, 3, 0] },
  { name: "open Dsus2", chord: "Dsus2", frets: [-1, -1, 0, 2, 3, 0] },
  { name: "open Dsus4", chord: "Dsus4", frets: [-1, -1, 0, 2, 3, 3] },
  { name: "open Cadd9", chord: "Cadd9", frets: [-1, 3, 2, 0, 3, 0] },
  // Barre shapes
  { name: "F barre (E shape, 1st)", chord: "F", frets: [1, 3, 3, 2, 1, 1] },
  { name: "G barre (E shape, 3rd)", chord: "G", frets: [3, 5, 5, 4, 3, 3] },
  { name: "Bm barre (A shape, 2nd)", chord: "Bm", frets: [-1, 2, 4, 4, 3, 2] },
  { name: "C barre (A shape, 3rd)", chord: "C", frets: [-1, 3, 5, 5, 5, 3] },
  { name: "F#m barre (E shape, 2nd)", chord: "F#m", frets: [2, 4, 4, 2, 2, 2] },
  { name: "Bb barre (A shape, 1st)", chord: "Bb", frets: [-1, 1, 3, 3, 3, 1] },
  { name: "Cm barre (A shape, 3rd)", chord: "Cm", frets: [-1, 3, 5, 5, 4, 3] },
  // Power chords
  { name: "E5", chord: "E5", frets: [0, 2, 2, -1, -1, -1] },
  { name: "A5", chord: "A5", frets: [-1, 0, 2, 2, -1, -1] },
  { name: "G5", chord: "G5", frets: [3, 5, 5, -1, -1, -1] },
  // Inversions
  { name: "C/G", chord: "C/G", frets: [3, 3, 2, 0, 1, 0] },
  { name: "C/E", chord: "C/E", frets: [0, 3, 2, 0, 1, 0] },
  { name: "D/F#", chord: "D/F#", frets: [2, -1, 0, 2, 3, 2] },
  { name: "G/B", chord: "G/B", frets: [-1, 2, 0, 0, 0, 3] },
  { name: "Am/C", chord: "Am/C", frets: [-1, 3, 2, 2, 1, 0] },
  // Other tunings
  { name: "drop D: D", chord: "D", frets: [0, 0, 0, 2, 3, 2], tuning: "drop-d" },
  { name: "drop D: D5", chord: "D5", frets: [0, 0, 0, -1, -1, -1], tuning: "drop-d" },
  { name: "drop D: G", chord: "G", frets: [5, 5, 5, 4, 3, 3], tuning: "drop-d" },
  { name: "half step down: E shape (Eb)", chord: "Eb", frets: [0, 2, 2, 1, 0, 0], tuning: "half-step-down" },
  { name: "half step down: G shape (Gb)", chord: "Gb", frets: [3, 2, 0, 0, 0, 3], tuning: "half-step-down" },
  { name: "DADGAD: Dsus4", chord: "Dsus4", frets: [0, 0, 0, 0, 0, 0], tuning: "dadgad" },
  { name: "DADGAD: D", chord: "D", frets: [0, 0, 4, 2, 0, 0], tuning: "dadgad" },
];
