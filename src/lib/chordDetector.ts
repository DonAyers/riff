import { Chord } from "tonal";

/**
 * Given an array of pitch class strings (e.g. ["C", "E", "G"]),
 * detect the most likely chord name.
 */
export function detectChord(pitchClasses: string[]): string | null {
  if (pitchClasses.length < 2) return null;

  const detected = Chord.detect(pitchClasses);
  if (detected.length === 0) return null;

  // Return the first (most likely) match
  return detected[0];
}

/**
 * Return a human-friendly chord label.
 * e.g. "CM" → "C Major", "Am" → "A minor", etc.
 * Falls back to the raw symbol if no nice name is found.
 */
export function formatChordName(symbol: string): string {
  const chord = Chord.get(symbol);
  if (chord.empty) return symbol;

  const root = chord.tonic ?? "";
  const quality = chord.quality;

  const qualityMap: Record<string, string> = {
    Major: "Major",
    Minor: "Minor",
    Diminished: "Diminished",
    Augmented: "Augmented",
  };

  const label = qualityMap[quality] ?? chord.aliases?.[0] ?? quality;
  return `${root} ${label}`;
}
