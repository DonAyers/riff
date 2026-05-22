import { describe, expect, it } from "vitest";
import { detectChordTimeline } from "./chordDetector";
import { PROFILES } from "./instrumentProfiles";
import { filterNotes, mapNoteEvents } from "./noteMapper";
import type { DetectedNote } from "../hooks/usePitchDetection";

function detectedNote(
  pitchMidi: number,
  startTimeS: number,
  durationS = 1.6,
  amplitude = 0.68,
): DetectedNote {
  return { pitchMidi, startTimeS, durationS, amplitude };
}

function strum(
  pitchMidis: readonly number[],
  startTimeS: number,
  options: { onsetStepS?: number; durationS?: number; amplitude?: number } = {},
): DetectedNote[] {
  const onsetStepS = options.onsetStepS ?? 0.04;
  return pitchMidis.map((pitchMidi, index) =>
    detectedNote(
      pitchMidi,
      startTimeS + index * onsetStepS,
      options.durationS,
      options.amplitude,
    ),
  );
}

function detectGuitarLabels(notes: readonly DetectedNote[]): string[] {
  const mapped = mapNoteEvents([...notes]);
  const filtered = filterNotes(mapped, PROFILES.guitar);
  return detectChordTimeline(filtered, PROFILES.guitar.chordWindowS).map((event) => event.label);
}

describe("guitar chord quality gate", () => {
  it("keeps a six-string open G down-strum together when adjacent string attacks are close", () => {
    const openGMajor = [43, 47, 50, 55, 59, 67];

    expect(detectGuitarLabels(strum(openGMajor, 0, { onsetStepS: 0.04 }))).toEqual([
      "G Major",
    ]);
  });

  it("keeps a slow picked triad together when each adjacent onset is inside the guitar window", () => {
    const pickedCMajor = [48, 52, 55];

    expect(detectGuitarLabels(strum(pickedCMajor, 0, { onsetStepS: 0.11 }))).toEqual([
      "C Major",
    ]);
  });

  it("detects a simple open-chord progression as ordered chord events", () => {
    const progression = [
      ...strum([48, 52, 55, 60, 64], 0),
      ...strum([43, 47, 50, 55, 59, 67], 1),
      ...strum([45, 52, 57, 60, 64], 2),
      ...strum([41, 48, 53, 57, 60, 65], 3),
    ];

    expect(detectGuitarLabels(progression)).toEqual([
      "C Major",
      "G Major",
      "A Minor",
      "F Major",
    ]);
  });

  it("keeps repeated adjacent C major strums as separate events", () => {
    const repeatedChord = [
      ...strum([48, 52, 55], 0, { onsetStepS: 0.04 }),
      ...strum([48, 52, 55], 0.45, { onsetStepS: 0.04 }),
    ];

    expect(detectGuitarLabels(repeatedChord)).toEqual(["C Major", "C Major"]);
  });

  it("filters common Basic Pitch guitar artifacts before detecting the chord", () => {
    const noisyCMajor = [
      ...strum([48, 52, 55], 0.2, { onsetStepS: 0.02 }),
      detectedNote(64, 0.25, 1.5, 0.08),
      detectedNote(80, 0.19, 0.015, 0.35),
      detectedNote(28, 0.1, 2.5, 0.2),
      detectedNote(96, 0.23, 0.8, 0.12),
    ];

    expect(detectGuitarLabels(noisyCMajor)).toEqual(["C Major"]);
  });

  it.each([
    { name: "open G7", midis: [43, 47, 50, 53, 59, 65], expected: "G dominant 7" },
    { name: "C major 7", midis: [48, 52, 55, 59], expected: "C major 7" },
    { name: "A minor 7", midis: [45, 52, 57, 60, 64, 67], expected: "A minor 7" },
    { name: "D sus4", midis: [50, 55, 57, 62], expected: "D sus4" },
    { name: "C add9", midis: [48, 52, 55, 62], expected: "C add9" },
    { name: "E power chord", midis: [40, 47], expected: "E power chord" },
    { name: "barre F major", midis: [41, 48, 53, 57, 60, 65], expected: "F Major" },
    { name: "open Bm7", midis: [47, 54, 57, 62, 66], expected: "B minor 7" },
  ])("detects richer guitar quality for $name", ({ midis, expected }) => {
    expect(detectGuitarLabels(strum(midis, 0, { onsetStepS: 0.035 }))).toEqual([expected]);
  });
});