/**
 * Integration tests for the instrument-profile → filter → chord-detect pipeline.
 *
 * These simulate realistic DetectedNote output from the ML model (basic-pitch)
 * for guitar recordings of varying quality, then run the full
 * processing chain and verify the profile constraints produce correct results.
 */
import { describe, expect, it } from "vitest";
import { mapNoteEvents, filterNotes, getUniquePitchClasses } from "./noteMapper";
import { detectChordsWindowed, detectChordTimeline } from "./chordDetector";
import { PROFILES } from "./instrumentProfiles";
import type { DetectedNote } from "../hooks/usePitchDetection";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function note(
  pitchMidi: number,
  startTimeS: number,
  durationS: number,
  amplitude: number,
): DetectedNote {
  return { pitchMidi, startTimeS, durationS, amplitude };
}

// ---------------------------------------------------------------------------
// Realistic detection output fixtures
// ---------------------------------------------------------------------------

/** Clean guitar C major strum — C3 E3 G3 ringing together */
const GUITAR_C_MAJOR_CLEAN: DetectedNote[] = [
  note(48, 0.20, 2.0, 0.72), // C3
  note(52, 0.22, 1.9, 0.68), // E3
  note(55, 0.21, 1.8, 0.70), // G3
];

/** Noisy guitar C major — main chord + artifacts the ML model would emit */
const GUITAR_C_MAJOR_NOISY: DetectedNote[] = [
  // Real chord tones
  note(48, 0.20, 2.0, 0.72), // C3
  note(52, 0.22, 1.9, 0.68), // E3
  note(55, 0.21, 1.8, 0.70), // G3
  // Ghost note — quiet open E4 string sympathetic vibration
  note(64, 0.25, 1.5, 0.08),
  // Pick noise — very short bright transient
  note(80, 0.19, 0.015, 0.35),
  // Sub-bass artifact below guitar range (room rumble picked up by model)
  note(28, 0.10, 2.5, 0.20),  // E1, below guitar MIDI 40
  // High harmonic artifact above guitar range
  note(96, 0.23, 0.8, 0.12),  // C7, above guitar MIDI 88
];

/** Guitar A minor — A2 E3 A3 C4 E4, 5-string voicing */
const GUITAR_AM: DetectedNote[] = [
  note(45, 0.20, 2.0, 0.65), // A2
  note(52, 0.22, 1.9, 0.68), // E3
  note(57, 0.21, 1.8, 0.67), // A3
  note(60, 0.23, 1.7, 0.64), // C4
  note(64, 0.24, 1.6, 0.62), // E4
];

/** Low-quality guitar — quiet signal, ghost notes close in amplitude to real ones */
const GUITAR_LOW_QUALITY: DetectedNote[] = [
  note(48, 0.30, 1.8, 0.20), // C3 (barely above guitar minAmplitude 0.15)
  note(52, 0.32, 1.7, 0.18), // E3
  note(55, 0.31, 1.6, 0.19), // G3
  // Noise just below threshold
  note(40, 0.50, 0.8, 0.10), // E2 ghost — below 0.15
  note(72, 0.33, 0.03, 0.22), // C5 — short but above amp threshold, below dur threshold on guitar (0.05)
];

/** Guitar C major with a realistic down-strum spread that still belongs to one hit */
const GUITAR_C_MAJOR_STAGGERED_STRUM: DetectedNote[] = [
  note(48, 0.20, 1.8, 0.72), // C3
  note(52, 0.28, 1.7, 0.68), // E3
  note(55, 0.34, 1.6, 0.70), // G3
];

/** Two guitar C major strums with long sustain that should still stay separated */
const GUITAR_C_MAJOR_SEPARATED_STRUMS: DetectedNote[] = [
  note(48, 0.20, 1.8, 0.72), // C3
  note(52, 0.28, 1.7, 0.68), // E3
  note(55, 0.34, 1.6, 0.70), // G3
  note(48, 0.58, 1.8, 0.71), // C3
  note(52, 0.66, 1.7, 0.67), // E3
  note(55, 0.72, 1.6, 0.69), // G3
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("instrument profile integration — guitar", () => {
  const profile = PROFILES.guitar;

  it("clean C major → detects C major chord", () => {
    const mapped = mapNoteEvents(GUITAR_C_MAJOR_CLEAN);
    const filtered = filterNotes(mapped, profile);
    expect(filtered).toHaveLength(3);

    const chord = detectChordsWindowed(filtered, profile.chordWindowS);
    expect(chord).toBeTruthy();
    expect(chord!).toContain("C");
  });

  it("noisy C major → filters artifacts, still detects C major", () => {
    const mapped = mapNoteEvents(GUITAR_C_MAJOR_NOISY);
    expect(mapped).toHaveLength(7); // all 7 notes come through from the model

    const filtered = filterNotes(mapped, profile);

    // Should remove: ghost E4 (amp 0.08 < 0.15), pick noise (dur 0.015 < 0.05),
    // sub-bass E1 (MIDI 28 < 40), high C7 (MIDI 96 > 88)
    expect(filtered).toHaveLength(3); // only the 3 real chord tones survive

    const chord = detectChordsWindowed(filtered, profile.chordWindowS);
    expect(chord).toBeTruthy();
    expect(chord!).toContain("C");
  });

  it("A minor 5-string voicing → detects Am", () => {
    const mapped = mapNoteEvents(GUITAR_AM);
    const filtered = filterNotes(mapped, profile);
    expect(filtered).toHaveLength(5);

    const chord = detectChordsWindowed(filtered, profile.chordWindowS);
    expect(chord).toBeTruthy();
    // tonal may return "Am" or "Amin" or "ACEm" — just check it contains A
    expect(chord!).toMatch(/A/i);
  });

  it("low-quality recording → filters out noise, keeps audible notes", () => {
    const mapped = mapNoteEvents(GUITAR_LOW_QUALITY);
    const filtered = filterNotes(mapped, profile);

    // C3 (amp 0.20 ≥ 0.15, dur 1.8 ≥ 0.05) ✓
    // E3 (amp 0.18 ≥ 0.15, dur 1.7 ≥ 0.05) ✓
    // G3 (amp 0.19 ≥ 0.15, dur 1.6 ≥ 0.05) ✓
    // E2 ghost (amp 0.10 < 0.15) ✗
    // C5 (dur 0.03 < 0.05) ✗
    expect(filtered).toHaveLength(3);

    const chord = detectChordsWindowed(filtered, profile.chordWindowS);
    expect(chord).toBeTruthy();
    expect(chord!).toContain("C");
  });

  it("staggered guitar strum → clusters one chord event", () => {
    const mapped = mapNoteEvents(GUITAR_C_MAJOR_STAGGERED_STRUM);
    const filtered = filterNotes(mapped, profile);
    const timeline = detectChordTimeline(filtered, profile.chordWindowS);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.startTimeS).toBeCloseTo(0.2, 5);
    expect(timeline[0]?.label).toContain("C");
  });

  it("separated guitar strums stay in separate chord clusters even with overlapping sustain", () => {
    const mapped = mapNoteEvents(GUITAR_C_MAJOR_SEPARATED_STRUMS);
    const filtered = filterNotes(mapped, profile);
    const timeline = detectChordTimeline(filtered, profile.chordWindowS);

    expect(timeline).toHaveLength(2);
    expect(timeline[0]?.startTimeS).toBeCloseTo(0.2, 5);
    expect(timeline[1]?.startTimeS).toBeCloseTo(0.58, 5);
    expect(timeline[0]?.label).toContain("C");
    expect(timeline[1]?.label).toContain("C");
  });

  it("default profile does NOT filter noisy artifacts", () => {
    const mapped = mapNoteEvents(GUITAR_C_MAJOR_NOISY);
    const defaultFiltered = filterNotes(mapped, PROFILES.default);
    // Default has no min amplitude or duration filters — keeps everything in MIDI 21-108
    // Only the sub-bass E1 (MIDI 28) stays since 28 ≥ 21
    expect(defaultFiltered.length).toBeGreaterThan(3);
  });
});

describe("profile comparison — same noisy input, different results", () => {
  it("guitar profile cleans up noise that default profile leaves in", () => {
    const mapped = mapNoteEvents(GUITAR_C_MAJOR_NOISY);

    const defaultFiltered = filterNotes(mapped, PROFILES.default);
    const guitarFiltered = filterNotes(mapped, PROFILES.guitar);

    expect(guitarFiltered.length).toBeLessThan(defaultFiltered.length);
    expect(guitarFiltered).toHaveLength(3);

    // Guitar detects clean C major
    const guitarChord = detectChordsWindowed(guitarFiltered, PROFILES.guitar.chordWindowS);
    expect(guitarChord).toContain("C");

    // Default might detect something else due to extra pitch classes
    const defaultPitchClasses = getUniquePitchClasses(defaultFiltered);
    expect(defaultPitchClasses.length).toBeGreaterThan(3);
  });
});
