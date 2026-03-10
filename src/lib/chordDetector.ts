import { Chord } from "tonal";
import type { MappedNote } from "./noteMapper";

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
 * Group overlapping / nearby notes into time clusters and detect a chord per cluster.
 * Returns the chord from the cluster with the most notes (dominant chord).
 * When windowS is 0, falls back to the original whole-recording behaviour.
 */
export function detectChordsWindowed(
  notes: MappedNote[],
  windowS: number,
): string | null {
  if (notes.length === 0) return null;

  // No windowing — fall back to pooling all pitch classes
  if (windowS <= 0) {
    const pitchClasses = [...new Set(notes.map((n) => n.pitchClass))];
    return detectChord(pitchClasses);
  }

  // Sort notes by start time
  const sorted = [...notes].sort((a, b) => a.startTimeS - b.startTimeS);

  // Cluster notes that overlap within the window
  const clusters: MappedNote[][] = [];
  let current: MappedNote[] = [sorted[0]];
  let clusterEnd = sorted[0].startTimeS + sorted[0].durationS;

  for (let i = 1; i < sorted.length; i++) {
    const note = sorted[i];
    if (note.startTimeS <= clusterEnd + windowS) {
      current.push(note);
      clusterEnd = Math.max(clusterEnd, note.startTimeS + note.durationS);
    } else {
      clusters.push(current);
      current = [note];
      clusterEnd = note.startTimeS + note.durationS;
    }
  }
  clusters.push(current);

  // Detect chord per cluster and return the one from the largest cluster
  let bestChord: string | null = null;
  let bestSize = 0;

  for (const cluster of clusters) {
    const pitchClasses = [...new Set(cluster.map((n) => n.pitchClass))];
    const chord = detectChord(pitchClasses);
    if (chord && cluster.length > bestSize) {
      bestChord = chord;
      bestSize = cluster.length;
    }
  }

  return bestChord;
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
