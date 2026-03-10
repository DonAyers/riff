import { describe, expect, it } from "vitest";
import { filterNotes } from "./noteMapper";
import { PROFILES } from "./instrumentProfiles";
import type { MappedNote } from "./noteMapper";

function makeNote(overrides: Partial<MappedNote> = {}): MappedNote {
  return {
    midi: 60,
    name: "C4",
    pitchClass: "C",
    octave: 4,
    startTimeS: 0,
    durationS: 0.3,
    amplitude: 0.8,
    ...overrides,
  };
}

describe("filterNotes", () => {
  it("keeps notes within default profile (no filtering)", () => {
    const notes = [makeNote({ midi: 60 }), makeNote({ midi: 30, amplitude: 0.01, durationS: 0.01 })];
    const result = filterNotes(notes, PROFILES.default);
    expect(result).toHaveLength(2);
  });

  it("filters notes below guitar MIDI range", () => {
    const notes = [makeNote({ midi: 30, name: "F#1", pitchClass: "F#", octave: 1 })];
    const result = filterNotes(notes, PROFILES.guitar);
    expect(result).toHaveLength(0);
  });

  it("filters notes above guitar MIDI range", () => {
    const notes = [makeNote({ midi: 100, name: "E7", pitchClass: "E", octave: 7 })];
    const result = filterNotes(notes, PROFILES.guitar);
    expect(result).toHaveLength(0);
  });

  it("filters quiet notes below guitar minAmplitude", () => {
    const notes = [makeNote({ amplitude: 0.05 })];
    const result = filterNotes(notes, PROFILES.guitar);
    expect(result).toHaveLength(0);
  });

  it("filters short notes below guitar minDurationS", () => {
    const notes = [makeNote({ durationS: 0.02 })];
    const result = filterNotes(notes, PROFILES.guitar);
    expect(result).toHaveLength(0);
  });

  it("keeps valid guitar notes", () => {
    const notes = [makeNote({ midi: 60, amplitude: 0.5, durationS: 0.2 })];
    const result = filterNotes(notes, PROFILES.guitar);
    expect(result).toHaveLength(1);
  });
});
