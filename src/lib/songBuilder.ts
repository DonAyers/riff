import { Chord, Midi } from "tonal";
import type { ChordEvent } from "./chordDetector";
import type { MappedNote } from "./noteMapper";

export interface SongBuilderChord {
  id: string;
  chord: string;
  label: string;
  sourceStartTimeS: number;
  sourceEndTimeS: number;
  playbackBeats: number;
  editedNotes?: SongBuilderChordNote[];
}

export interface SongBuilderChordNote {
  id: string;
  label: string;
  role?: string;
  muted?: boolean;
}

export interface SongBuilderPlaybackOptions {
  slotDurationS?: number;
  strumOffsetS?: number;
  noteDurationS?: number;
  amplitude?: number;
}

export interface SongBuilderPlaybackWindow {
  id: string;
  startTimeS: number;
  endTimeS: number;
  durationS: number;
}

export interface ManualSongBuilderChordInput {
  root: string;
  quality: ManualSongBuilderChordQuality;
  index: number;
}

export interface ManualSongBuilderChordQuality {
  id: string;
  label: string;
  suffix: string;
}

export const MANUAL_SONG_BUILDER_CHORD_QUALITIES: readonly ManualSongBuilderChordQuality[] = [
  { id: "major", label: "Major", suffix: "M" },
  { id: "minor", label: "Minor", suffix: "m" },
  { id: "dominant-7", label: "Dominant 7", suffix: "7" },
  { id: "major-7", label: "Major 7", suffix: "maj7" },
  { id: "minor-7", label: "Minor 7", suffix: "m7" },
  { id: "sus2", label: "Sus2", suffix: "sus2" },
  { id: "sus4", label: "Sus4", suffix: "sus4" },
  { id: "diminished", label: "Diminished", suffix: "dim" },
  { id: "augmented", label: "Augmented", suffix: "aug" },
  { id: "power", label: "Power chord", suffix: "5" },
];

const DEFAULT_SLOT_DURATION_S = 1;
const DEFAULT_STRUM_OFFSET_S = 0.032;
const DEFAULT_NOTE_DURATION_S = 0.78;
const DEFAULT_AMPLITUDE = 0.45;
const BASE_OCTAVE = 3;
const MIN_PLAYBACK_MIDI = 48;
const MAX_PLAYBACK_MIDI = 76;

export function chordTimelineToBuilderItems(events: ChordEvent[]): SongBuilderChord[] {
  return events.map((event, index) => ({
    id: `${event.chord}-${event.startTimeS}-${index}`,
    chord: event.chord,
    label: event.label,
    sourceStartTimeS: event.startTimeS,
    sourceEndTimeS: event.endTimeS,
    playbackBeats: 1,
  }));
}

export function createManualSongBuilderChord({
  root,
  quality,
  index,
}: ManualSongBuilderChordInput): SongBuilderChord {
  const chord = `${root}${quality.suffix}`;
  return {
    id: `manual-${root}-${quality.id}-${index}`,
    chord,
    label: getManualChordLabel(chord, root, quality.label),
    sourceStartTimeS: index,
    sourceEndTimeS: index + DEFAULT_SLOT_DURATION_S,
    playbackBeats: 1,
    editedNotes: chordNotesFromSymbol(chord),
  };
}

export function moveSongBuilderChord(
  items: readonly SongBuilderChord[],
  fromIndex: number,
  toIndex: number,
): SongBuilderChord[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return [...items];
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function duplicateSongBuilderChord(
  items: readonly SongBuilderChord[],
  id: string,
): SongBuilderChord[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return [...items];

  const item = items[index];
  const copy: SongBuilderChord = {
    ...item,
    id: getNextCopyId(items, item.id),
  };
  const next = [...items];
  next.splice(index + 1, 0, copy);
  return next;
}

export function deleteSongBuilderChord(
  items: readonly SongBuilderChord[],
  id: string,
): SongBuilderChord[] {
  return items.filter((item) => item.id !== id);
}

export function reverseSongBuilderChords(items: readonly SongBuilderChord[]): SongBuilderChord[] {
  return [...items].reverse();
}

export function shuffleSongBuilderChords(
  items: readonly SongBuilderChord[],
  seed = 1,
): SongBuilderChord[] {
  const shuffled = items
    .map((item, index) => ({
      item,
      index,
      rank: hashString(`${seed}:${item.id}:${item.chord}:${item.sourceStartTimeS}:${index}`),
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);

  if (items.length > 1 && shuffled.every((item, index) => item.id === items[index]?.id)) {
    return moveSongBuilderChord(shuffled, 0, shuffled.length - 1);
  }

  return shuffled;
}

export function getSongBuilderPlaybackWindows(
  items: readonly SongBuilderChord[],
  slotDurationS = DEFAULT_SLOT_DURATION_S,
): SongBuilderPlaybackWindow[] {
  let nextStartTimeS = 0;

  return items.map((item) => {
    const durationS = getChordPlaybackSlotDurationS(item, slotDurationS);
    const window = {
      id: item.id,
      startTimeS: nextStartTimeS,
      endTimeS: nextStartTimeS + durationS,
      durationS,
    };
    nextStartTimeS = window.endTimeS;
    return window;
  });
}

export function getCurrentSongBuilderChordId(
  items: readonly SongBuilderChord[],
  currentTimeS: number,
  isPlaying: boolean,
  slotDurationS = DEFAULT_SLOT_DURATION_S,
): string | null {
  if (!isPlaying || items.length === 0 || !Number.isFinite(currentTimeS)) return null;

  const windows = getSongBuilderPlaybackWindows(items, slotDurationS);
  return windows.find((window) => currentTimeS >= window.startTimeS && currentTimeS < window.endTimeS)?.id ?? null;
}

export function songBuilderChordsToPlaybackNotes(
  items: readonly SongBuilderChord[],
  options: SongBuilderPlaybackOptions = {},
): MappedNote[] {
  const slotDurationS = options.slotDurationS ?? DEFAULT_SLOT_DURATION_S;
  const strumOffsetS = options.strumOffsetS ?? DEFAULT_STRUM_OFFSET_S;
  const noteDurationS = options.noteDurationS ?? DEFAULT_NOTE_DURATION_S;
  const amplitude = options.amplitude ?? DEFAULT_AMPLITUDE;
  const windows = getSongBuilderPlaybackWindows(items, slotDurationS);

  return items.flatMap((item, itemIndex) => {
    const pitchClasses = getSongBuilderChordPitchClasses(item);
    const startTimeS = windows[itemIndex]?.startTimeS ?? itemIndex * slotDurationS;
    let previousMidi: number | null = null;

    return pitchClasses.flatMap((pitchClass, noteIndex) => {
      const midi = pitchClassToPlayableMidi(pitchClass, previousMidi);
      if (midi === null) return [];
      previousMidi = midi;
      const name = Midi.midiToNoteName(midi) ?? `${pitchClass}${BASE_OCTAVE}`;

      return [{
        midi,
        name,
        pitchClass,
        octave: getMidiOctave(midi),
        startTimeS: startTimeS + noteIndex * strumOffsetS,
        durationS: noteDurationS,
        amplitude,
      }];
    });
  });
}

function getNextCopyId(items: readonly SongBuilderChord[], baseId: string): string {
  const existingIds = new Set(items.map((item) => item.id));
  let copyNumber = 1;
  let nextId = `${baseId}-copy-${copyNumber}`;

  while (existingIds.has(nextId)) {
    copyNumber += 1;
    nextId = `${baseId}-copy-${copyNumber}`;
  }

  return nextId;
}

function getChordPlaybackSlotDurationS(item: SongBuilderChord, fallbackDurationS: number): number {
  const sourceDurationS = item.sourceEndTimeS - item.sourceStartTimeS;
  if (!Number.isFinite(sourceDurationS) || sourceDurationS <= 0) return fallbackDurationS;
  return roundSeconds(Math.max(fallbackDurationS, sourceDurationS));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roundSeconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

function getChordPitchClasses(chordSymbol: string): string[] {
  const chord = Chord.get(chordSymbol);
  if (chord.empty) return [];
  return chord.notes;
}

function getManualChordLabel(chordSymbol: string, root: string, qualityLabel: string): string {
  const chord = Chord.get(chordSymbol);
  return chord.empty ? `${root} ${qualityLabel}` : `${chord.tonic ?? root} ${qualityLabel}`;
}

function getSongBuilderChordPitchClasses(item: SongBuilderChord): string[] {
  if (!item.editedNotes) {
    return getChordPitchClasses(item.chord);
  }

  return item.editedNotes
    .filter((note) => !note.muted)
    .map((note) => note.label.trim())
    .filter((label) => label.length > 0);
}

function pitchClassToPlayableMidi(pitchClass: string, previousMidi: number | null): number | null {
  let midi = Midi.toMidi(`${pitchClass}${BASE_OCTAVE}`);
  if (midi === null) return null;

  while (previousMidi !== null && midi <= previousMidi) midi += 12;

  while (midi < MIN_PLAYBACK_MIDI) midi += 12;
  while (midi > MAX_PLAYBACK_MIDI) midi -= 12;
  return midi;
}

function getMidiOctave(midi: number): number {
  return Math.floor(midi / 12) - 1;
}

export function chordNotesFromSymbol(chordSymbol: string): SongBuilderChordNote[] {
  const chord = Chord.get(chordSymbol);
  if (chord.empty) return [];

  return chord.notes.map((label, index) => ({
    id: `${label}-${index}`,
    label,
    role: index === 0 ? "root" : index === 1 ? "third" : index === 2 ? "fifth" : "color",
  }));
}