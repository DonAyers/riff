import { Chord } from "tonal";
import { buildStrumClusters } from "./guitarStrumPlayback";
import type { MappedNote } from "./noteMapper";

export interface ChordEvent {
  chord: string;
  label: string;
  startTimeS: number;
  endTimeS: number;
}

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
 * Group nearby note onsets into time clusters and detect a chord per cluster.
 * Returns the chord from the cluster with the most notes (dominant chord).
 * When windowS is 0, falls back to the original whole-recording behaviour.
 */
export function detectChordTimeline(notes: MappedNote[], windowS: number): ChordEvent[] {
  if (notes.length === 0) return [];

  // No windowing — fall back to pooling all pitch classes
  if (windowS <= 0) {
    const pitchClasses = [...new Set(notes.map((n) => n.pitchClass))];
    const detected = detectChord(pitchClasses);
    if (!detected) return [];
    const startTimeS = Math.min(...notes.map((note) => note.startTimeS));
    const endTimeS = Math.max(...notes.map((note) => note.startTimeS + note.durationS));
    return [{ chord: detected, label: formatChordName(detected), startTimeS, endTimeS }];
  }

  const clusters = buildStrumClusters(notes, windowS).map((cluster) =>
    cluster.noteIndices.map((index) => notes[index]),
  );

  return clusters.flatMap((cluster) => {
    const pitchClasses = [...new Set(cluster.map((n) => n.pitchClass))];
    const chord = detectChord(pitchClasses);
    if (!chord) return [];

    const startTimeS = Math.min(...cluster.map((note) => note.startTimeS));
    const endTimeS = Math.max(...cluster.map((note) => note.startTimeS + note.durationS));

    return [{
      chord,
      label: formatChordName(chord),
      startTimeS,
      endTimeS,
    }];
  });
}

/**
 * Backward-compatible summary API: returns the chord from the largest cluster.
 */
export function detectChordsWindowed(
  notes: MappedNote[],
  windowS: number,
): string | null {
  const events = detectChordTimeline(notes, windowS);
  if (events.length === 0) return null;

  const largest = events.reduce((best, current) => {
    const currentSpan = current.endTimeS - current.startTimeS;
    const bestSpan = best.endTimeS - best.startTimeS;
    return currentSpan > bestSpan ? current : best;
  });

  return largest.chord;
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
