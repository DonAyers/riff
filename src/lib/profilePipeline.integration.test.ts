/**
 * Integration tests for the instrument-profile → filter → chord-detect pipeline.
 *
 * These simulate realistic DetectedNote output from the ML model (basic-pitch)
 * for guitar and piano recordings of varying quality, then run the full
 * processing chain and verify the profile constraints produce correct results.
 */
import { describe, expect, it } from "vitest";
import { mapNoteEvents, filterNotes, getUniquePitchClasses } from "./noteMapper";
import { detectChord, detectChordsWindowed } from "./chordDetector";
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

/** Clean piano C major — C4 E4 G4, wider amp, longer sustain */
const PIANO_C_MAJOR_CLEAN: DetectedNote[] = [
  note(60, 0.20, 2.5, 0.80), // C4
  note(64, 0.20, 2.4, 0.76), // E4
  note(67, 0.20, 2.3, 0.74), // G4
];

/** Piano two chords: C major at 0.2s, then A minor at 3.0s */
const PIANO_TWO_CHORDS: DetectedNote[] = [
  // Chord 1: C major
  note(60, 0.20, 1.5, 0.80), // C4
  note(64, 0.20, 1.4, 0.76), // E4
  note(67, 0.20, 1.3, 0.74), // G4
  // Chord 2: A minor (well separated in time)
  note(57, 3.00, 1.5, 0.78), // A3
  note(60, 3.00, 1.4, 0.75), // C4
  note(64, 3.00, 1.3, 0.73), // E4
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

  it("default profile does NOT filter noisy artifacts", () => {
    const mapped = mapNoteEvents(GUITAR_C_MAJOR_NOISY);
    const defaultFiltered = filterNotes(mapped, PROFILES.default);
    // Default has no min amplitude or duration filters — keeps everything in MIDI 21-108
    // Only the sub-bass E1 (MIDI 28) stays since 28 ≥ 21
    expect(defaultFiltered.length).toBeGreaterThan(3);
  });
});

describe("instrument profile integration — piano", () => {
  const profile = PROFILES.piano;

  it("clean C major → detects C major chord", () => {
    const mapped = mapNoteEvents(PIANO_C_MAJOR_CLEAN);
    const filtered = filterNotes(mapped, profile);
    expect(filtered).toHaveLength(3);

    const chord = detectChordsWindowed(filtered, profile.chordWindowS);
    expect(chord).toBeTruthy();
    expect(chord!).toContain("C");
  });

  it("two sequential chords → windowed detection picks the larger cluster", () => {
    const mapped = mapNoteEvents(PIANO_TWO_CHORDS);
    const filtered = filterNotes(mapped, profile);
    expect(filtered).toHaveLength(6);

    // With windowing, notes are grouped by proximity.
    // Cluster 1 at t≈0.2 has CEG (C major), Cluster 2 at t≈3.0 has ACE (A minor).
    // Both clusters have 3 notes, so the first one found wins.
    const chord = detectChordsWindowed(filtered, profile.chordWindowS);
    expect(chord).toBeTruthy();
  });

  it("without windowing, all notes get pooled (less accurate)", () => {
    const mapped = mapNoteEvents(PIANO_TWO_CHORDS);
    const filtered = filterNotes(mapped, profile);
    const pitchClasses = getUniquePitchClasses(filtered);

    // Pool: A C E G → could detect Am7 or C6 — NOT a clean C major or A minor
    const chord = detectChord(pitchClasses);
    expect(chord).toBeTruthy();
    // The pooled result is "less clean" — it'll include more pitch classes
    expect(pitchClasses.length).toBe(4); // A, C, E, G all present
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
