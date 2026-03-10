import { Midi } from "tonal";
import type { DetectedNote } from "../hooks/usePitchDetection";
import type { InstrumentProfile } from "./instrumentProfiles";

export interface MappedNote {
  midi: number;
  name: string;       // e.g. "C4"
  pitchClass: string;  // e.g. "C"
  octave: number;
  startTimeS: number;
  durationS: number;
  amplitude: number;
}

export function mapNoteEvents(events: DetectedNote[]): MappedNote[] {
  return events.map((e) => {
    const name = Midi.midiToNoteName(e.pitchMidi) || `MIDI ${e.pitchMidi}`;
    const pitchClass = name.replace(/\d+$/, "");
    const octaveMatch = name.match(/(\d+)$/);
    const octave = octaveMatch ? parseInt(octaveMatch[1], 10) : 4;

    return {
      midi: e.pitchMidi,
      name,
      pitchClass,
      octave,
      startTimeS: e.startTimeS,
      durationS: e.durationS,
      amplitude: e.amplitude,
    };
  });
}

/** Get unique pitch classes from a set of notes, de-duplicated */
export function getUniquePitchClasses(notes: MappedNote[]): string[] {
  return [...new Set(notes.map((n) => n.pitchClass))];
}

/** Get unique note names sorted by MIDI number */
export function getUniqueNotes(notes: MappedNote[]): MappedNote[] {
  const seen = new Set<number>();
  const unique: MappedNote[] = [];
  for (const n of notes) {
    if (!seen.has(n.midi)) {
      seen.add(n.midi);
      unique.push(n);
    }
  }
  return unique.sort((a, b) => a.midi - b.midi);
}

/** Filter notes based on an instrument profile's constraints */
export function filterNotes(notes: MappedNote[], profile: InstrumentProfile): MappedNote[] {
  return notes.filter((n) =>
    n.midi >= profile.midiRange[0] &&
    n.midi <= profile.midiRange[1] &&
    n.amplitude >= profile.minAmplitude &&
    n.durationS >= profile.minDurationS
  );
}
