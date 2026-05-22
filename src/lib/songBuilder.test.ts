import { describe, expect, it } from "vitest";
import {
  chordTimelineToBuilderItems,
  createManualSongBuilderChord,
  deleteSongBuilderChord,
  duplicateSongBuilderChord,
  getCurrentSongBuilderChordId,
  getSongBuilderPlaybackWindows,
  MANUAL_SONG_BUILDER_CHORD_QUALITIES,
  moveSongBuilderChord,
  reverseSongBuilderChords,
  shuffleSongBuilderChords,
  songBuilderChordsToPlaybackNotes,
  type SongBuilderChord,
} from "./songBuilder";

function item(overrides: Partial<SongBuilderChord> = {}): SongBuilderChord {
  return {
    id: "c-0",
    chord: "CM",
    label: "C Major",
    sourceStartTimeS: 0,
    sourceEndTimeS: 0.8,
    playbackBeats: 1,
    ...overrides,
  };
}

describe("songBuilder", () => {
  it("derives builder items from chord events while preserving duplicates", () => {
    const items = chordTimelineToBuilderItems([
      { chord: "GM", label: "G Major", startTimeS: 0, endTimeS: 0.6 },
      { chord: "GM", label: "G Major", startTimeS: 0.8, endTimeS: 1.4 },
      { chord: "Am", label: "A Minor", startTimeS: 1.6, endTimeS: 2.2 },
    ]);

    expect(items.map((builderItem) => builderItem.label)).toEqual([
      "G Major",
      "G Major",
      "A Minor",
    ]);
    expect(items.map((builderItem) => builderItem.id)).toEqual([
      "GM-0-0",
      "GM-0.8-1",
      "Am-1.6-2",
    ]);
  });

  it("moves chords by index without mutating the original list", () => {
    const original = [
      item({ id: "c", label: "C Major" }),
      item({ id: "g", chord: "GM", label: "G Major" }),
      item({ id: "a", chord: "Am", label: "A Minor" }),
    ];

    const moved = moveSongBuilderChord(original, 0, 2);

    expect(moved.map((builderItem) => builderItem.id)).toEqual(["g", "a", "c"]);
    expect(original.map((builderItem) => builderItem.id)).toEqual(["c", "g", "a"]);
  });

  it("reverses and shuffles chords without mutating the original list", () => {
    const original = [
      item({ id: "c", label: "C Major" }),
      item({ id: "g", chord: "GM", label: "G Major" }),
      item({ id: "a", chord: "Am", label: "A Minor" }),
    ];

    const reversed = reverseSongBuilderChords(original);
    const shuffled = shuffleSongBuilderChords(original, 7);

    expect(reversed.map((builderItem) => builderItem.id)).toEqual(["a", "g", "c"]);
    expect(shuffled.map((builderItem) => builderItem.id)).not.toEqual(["c", "g", "a"]);
    expect(shuffleSongBuilderChords(original, 7).map((builderItem) => builderItem.id)).toEqual(
      shuffled.map((builderItem) => builderItem.id),
    );
    expect(original.map((builderItem) => builderItem.id)).toEqual(["c", "g", "a"]);
  });

  it("duplicates and deletes chords", () => {
    const original = [item({ id: "c" }), item({ id: "g", chord: "GM", label: "G Major" })];

    const duplicated = duplicateSongBuilderChord(original, "c");
    expect(duplicated.map((builderItem) => builderItem.id)).toEqual(["c", "c-copy-1", "g"]);
    expect(duplicated[1]).toEqual(expect.objectContaining({ chord: "CM", label: "C Major" }));

    const copiedAgain = duplicateSongBuilderChord(duplicated, "c");
    expect(copiedAgain.map((builderItem) => builderItem.id)).toEqual([
      "c",
      "c-copy-2",
      "c-copy-1",
      "g",
    ]);

    const deleted = deleteSongBuilderChord(duplicated, "c-copy-1");
    expect(deleted.map((builderItem) => builderItem.id)).toEqual(["c", "g"]);
  });

  it("turns chord cards into strummed pitch-class playback notes", () => {
    const notes = songBuilderChordsToPlaybackNotes([
      item({ id: "c", chord: "CM", label: "C Major" }),
      item({ id: "a", chord: "Am", label: "A Minor" }),
    ]);

    expect(notes.map((note) => note.pitchClass)).toEqual(["C", "E", "G", "A", "C", "E"]);
    expect(notes.map((note) => note.startTimeS)).toEqual([0, 0.032, 0.064, 1, 1.032, 1.064]);
    expect(notes[0]).toEqual(expect.objectContaining({ midi: 48, name: "C3", durationS: 0.78 }));
  });

  it("creates manual builder chords with Tonal-compatible symbols and editable notes", () => {
    const dominantQuality = MANUAL_SONG_BUILDER_CHORD_QUALITIES.find((quality) => quality.id === "dominant-7");
    expect(dominantQuality).toBeDefined();

    const chord = createManualSongBuilderChord({
      root: "Bb",
      quality: dominantQuality ?? MANUAL_SONG_BUILDER_CHORD_QUALITIES[0],
      index: 3,
    });

    expect(chord).toEqual(expect.objectContaining({
      id: "manual-Bb-dominant-7-3",
      chord: "Bb7",
      label: "Bb Dominant 7",
      sourceStartTimeS: 3,
      sourceEndTimeS: 4,
      playbackBeats: 1,
    }));
    expect(chord.editedNotes?.map((note) => note.label)).toEqual(["Bb", "D", "F", "Ab"]);
    expect(songBuilderChordsToPlaybackNotes([chord]).map((note) => note.pitchClass)).toEqual(["Bb", "D", "F", "Ab"]);
  });

  it("uses edited chord notes for playback while preserving unedited chord behavior", () => {
    const notes = songBuilderChordsToPlaybackNotes([
      item({
        id: "c",
        chord: "CM",
        label: "C Major",
        editedNotes: [
          { id: "c", label: "C", role: "root" },
          { id: "e", label: "E", role: "third", muted: true },
          { id: "bb", label: "Bb", role: "color" },
        ],
      }),
      item({ id: "g", chord: "GM", label: "G Major" }),
    ]);

    expect(notes.map((note) => note.pitchClass)).toEqual(["C", "Bb", "G", "B", "D"]);
    expect(notes.map((note) => note.startTimeS)).toEqual([0, 0.032, 1, 1.032, 1.064]);
  });

  it("finds the currently playing chord from the builder playback timeline", () => {
    const items = [
      item({ id: "c", sourceStartTimeS: 0, sourceEndTimeS: 0.6 }),
      item({ id: "g", chord: "GM", label: "G Major", sourceStartTimeS: 0.7, sourceEndTimeS: 2.2 }),
    ];

    expect(getSongBuilderPlaybackWindows(items)).toEqual([
      { id: "c", startTimeS: 0, endTimeS: 1, durationS: 1 },
      { id: "g", startTimeS: 1, endTimeS: 2.5, durationS: 1.5 },
    ]);
    expect(getCurrentSongBuilderChordId(items, 0.4, true)).toBe("c");
    expect(getCurrentSongBuilderChordId(items, 1.2, true)).toBe("g");
    expect(getCurrentSongBuilderChordId(items, 1.2, false)).toBeNull();
  });

  it("skips unknown chord symbols during generated playback", () => {
    expect(songBuilderChordsToPlaybackNotes([item({ chord: "not-a-chord" })])).toEqual([]);
  });
});