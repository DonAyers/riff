import { describe, expect, it } from "vitest";
import { detectChord, formatChordName, detectChordTimeline, detectChordsWindowed } from "./chordDetector";
import type { MappedNote } from "./noteMapper";

function note(pitchClass: string, midi: number, startTimeS: number, durationS = 0.3): MappedNote {
  return { midi, name: `${pitchClass}4`, pitchClass, octave: 4, startTimeS, durationS, amplitude: 0.8 };
}

describe("chordDetector", () => {
  it("detects a C major triad", () => {
    const result = detectChord(["C", "E", "G"]);
    expect(result).toBeTruthy();
  });

  it("returns null when fewer than two pitch classes are supplied", () => {
    expect(detectChord(["C"])).toBeNull();
  });

  it("formats common chord symbols into human readable names", () => {
    const label = formatChordName("Am");
    expect(label).toContain("A");
  });
});

describe("detectChordsWindowed", () => {
  it("returns null for empty notes", () => {
    expect(detectChordsWindowed([], 0.15)).toBeNull();
  });

  it("falls back to all-pitch-classes when windowS is 0", () => {
    const notes = [note("C", 60, 0), note("E", 64, 1), note("G", 67, 2)];
    const result = detectChordsWindowed(notes, 0);
    expect(result).toBeTruthy();
  });

  it("detects chord from a cluster of simultaneous notes", () => {
    const notes = [note("C", 60, 0), note("E", 64, 0.05), note("G", 67, 0.1)];
    const result = detectChordsWindowed(notes, 0.15);
    expect(result).toBeTruthy();
  });

  it("picks the largest cluster's chord when there are multiple clusters", () => {
    // Cluster 1: C E G (3 notes at t=0)
    // Cluster 2: A alone (1 note at t=5)
    const notes = [
      note("C", 60, 0), note("E", 64, 0.05), note("G", 67, 0.1),
      note("A", 69, 5),
    ];
    const result = detectChordsWindowed(notes, 0.15);
    // Should pick C major cluster, not the lone A
    expect(result).toBeTruthy();
    expect(result).toContain("C");
  });
});

describe("detectChordTimeline", () => {
  it("returns a chord event for a single cluster", () => {
    const notes = [note("C", 60, 0), note("E", 64, 0.05), note("G", 67, 0.1)];
    const result = detectChordTimeline(notes, 0.15);

    expect(result).toHaveLength(1);
    expect(result[0]?.chord).toContain("C");
    expect(result[0]?.label).toContain("C");
  });

  it("keeps a staggered strum in one cluster when onsets stay within the chord window", () => {
    const notes = [note("C", 60, 0, 1), note("E", 64, 0.07, 1), note("G", 67, 0.14, 1)];
    const result = detectChordTimeline(notes, 0.15);

    expect(result).toHaveLength(1);
    expect(result[0]?.startTimeS).toBeCloseTo(0, 5);
    expect(result[0]?.endTimeS).toBeCloseTo(1.14, 5);
    expect(result[0]?.chord).toContain("C");
  });

  it("returns one event per time cluster", () => {
    const notes = [
      note("C", 60, 0),
      note("E", 64, 0.05),
      note("G", 67, 0.1),
      note("F", 65, 1.2),
      note("A", 69, 1.25),
      note("C", 72, 1.3),
    ];
    const result = detectChordTimeline(notes, 0.15);

    expect(result).toHaveLength(2);
    expect(result[0]?.label).toContain("C");
    expect(result[1]?.label).toContain("F");
  });

  it("separates repeated strums when their onset anchors fall outside the chord window", () => {
    const notes = [
      note("C", 60, 0, 1),
      note("E", 64, 0.05, 1),
      note("G", 67, 0.1, 1),
      note("C", 72, 0.35, 1),
      note("E", 76, 0.4, 1),
      note("G", 79, 0.45, 1),
    ];
    const result = detectChordTimeline(notes, 0.15);

    expect(result).toHaveLength(2);
    expect(result[0]?.startTimeS).toBeCloseTo(0, 5);
    expect(result[1]?.startTimeS).toBeCloseTo(0.35, 5);
    expect(result[0]?.label).toContain("C");
    expect(result[1]?.label).toContain("C");
  });
});
