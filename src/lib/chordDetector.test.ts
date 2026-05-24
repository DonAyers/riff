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

  it("prefers a plain triad when pitch-class input order looks like an inversion but no bass is known", () => {
    expect(detectChord(["G", "C", "E"])).toBe("CM");
    expect(detectChord(["E", "G", "C"])).toBe("CM");
    expect(detectChord(["E", "A", "C"])).toBe("Am");
  });

  it("returns null when fewer than two pitch classes are supplied", () => {
    expect(detectChord(["C"])).toBeNull();
  });

  it("formats common chord symbols into human readable names", () => {
    expect(formatChordName("CM")).toBe("C Major");
    expect(formatChordName("Am")).toBe("A Minor");
    expect(formatChordName("G7")).toBe("G dominant 7");
    expect(formatChordName("Am7")).toBe("A minor 7");
    expect(formatChordName("Cmaj7")).toBe("C major 7");
    expect(formatChordName("Cadd9")).toBe("C add9");
    expect(formatChordName("CMadd9")).toBe("C add9");
    expect(formatChordName("C6")).toBe("C sixth");
    expect(formatChordName("G9")).toBe("G dominant 9");
    expect(formatChordName("G13")).toBe("G dominant 13");
    expect(formatChordName("Cm11")).toBe("C minor 11");
    expect(formatChordName("Dsus4")).toBe("D sus4");
    expect(formatChordName("Dsus2")).toBe("D sus2");
    expect(formatChordName("E5")).toBe("E power chord");
    expect(formatChordName("Cdim")).toBe("C Diminished");
    expect(formatChordName("Caug")).toBe("C Augmented");
  });

  it("prefers a non-slash candidate matching the bass pitch class", () => {
    const result = detectChord(["C", "E", "G", "A"], {
      bassPitchClass: "A",
      weights: new Map([
        ["A", 1.2],
        ["C", 0.8],
        ["E", 0.8],
        ["G", 0.8],
      ]),
    });

    expect(result).toBe("Am7");
  });

  it("detects root-fifth dyads as power chords", () => {
    expect(detectChord(["E", "B"], { bassPitchClass: "E" })).toBe("E5");
  });

  it("falls back to highest-weighted pitch classes when a quiet artifact prevents full-set detection", () => {
    const notes = [
      { ...note("C", 48, 0), amplitude: 0.9 },
      { ...note("E", 52, 0.01), amplitude: 0.8 },
      { ...note("G", 55, 0.02), amplitude: 0.8 },
      { ...note("D", 62, 0.03), amplitude: 0.75 },
      { ...note("C#", 61, 0.04), amplitude: 0.05 },
    ];

    expect(detectChordTimeline(notes, 0.15)[0]?.label).toBe("C add9");
  });

  it("recovers omitted-fifth extended chords after regular detection fails", () => {
    const notes = [
      { ...note("C", 48, 0), amplitude: 0.9 },
      { ...note("E", 52, 0.01), amplitude: 0.8 },
      { ...note("B", 59, 0.02), amplitude: 0.75 },
    ];

    expect(detectChordTimeline(notes, 0.15)[0]?.label).toBe("C major 7");
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

  it("uses nearby color tones to avoid collapsing arpeggiated Em7 into a power chord", () => {
    const notes = [
      note("E", 40, 0, 1.35),
      note("B", 47, 0.03, 1.32),
      note("G", 55, 0.24, 1.1),
      note("D", 62, 0.36, 0.95),
    ];
    const result = detectChordTimeline(notes, 0.15);

    expect(result[0]?.label).toBe("E minor 7");
    expect(result.map((event) => event.label)).not.toContain("E power chord");
  });

  it("does not drag long-ringing minor notes into a later chord change", () => {
    const notes = [
      note("E", 40, 0, 1.4),
      note("B", 47, 0.03, 1.35),
      note("G", 55, 0.24, 1.1),
      note("C", 48, 0.82, 1),
      note("E", 52, 0.86, 0.96),
      note("G", 55, 0.9, 0.92),
    ];
    const result = detectChordTimeline(notes, 0.15);
    const labels = result.map((event) => event.label);

    expect(labels[0]).toBe("E Minor");
    expect(labels).toContain("C Major");
  });
});
