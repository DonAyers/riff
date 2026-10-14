import { describe, expect, it } from "vitest";
import {
  describeInversion,
  describeVoicing,
  detectChord,
  detectChordTimeline,
  detectChordsWindowed,
  dominantChordEvent,
  formatChordName,
} from "./chordDetector";
import { mapNoteEvents, type MappedNote } from "./noteMapper";

function strum(midis: number[], startTimeS = 0, amplitude = 0.8, spreadS = 0.01): MappedNote[] {
  return mapNoteEvents(
    midis.map((pitchMidi, index) => ({ pitchMidi, startTimeS: startTimeS + index * spreadS, durationS: 1, amplitude })),
  );
}

const frets = (event: { voicing?: { frets: number[] } } | undefined) =>
  event?.voicing?.frets.map((fret) => (fret < 0 ? "x" : String(fret))).join("");

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

describe("chord voicing on the timeline", () => {
  it("reports the played notes in pitch order, the bass note and the played shape", () => {
    const [event] = detectChordTimeline(strum([48, 52, 55, 60, 64]), 0.15);

    expect(event?.label).toBe("C Major");
    expect(event?.notes).toEqual(["C3", "E3", "G3", "C4", "E4"]);
    expect(event?.bassNote).toBe("C3");
    expect(frets(event)).toBe("x32010");
  });

  it("names an inversion and shows the shape with the low string", () => {
    const [event] = detectChordTimeline(strum([43, 48, 52, 55, 60, 64]), 0.15);

    expect(event?.chord).toBe("CM/G");
    expect(event?.label).toBe("C Major/G");
    expect(event?.bassNote).toBe("G2");
    expect(frets(event)).toBe("332010");
  });

  it("lists the played shape's notes, so overtones Basic Pitch reported drop out", () => {
    const notes = [...strum([48, 52, 55, 60, 64]), ...strum([67, 72], 0.01, 0.3)];
    const [event] = detectChordTimeline(notes, 0.15);

    expect(frets(event)).toBe("x32010");
    expect(event?.notes).toEqual(["C3", "E3", "G3", "C4", "E4"]);
  });

  it("builds each strum's shape from its own notes, not a neighbouring strum's", () => {
    const notes = [...strum([48, 52, 55, 60, 64]), ...strum([43, 47, 50, 55, 59, 67], 0.2)];
    const events = detectChordTimeline(notes, 0.15);

    expect(events).toHaveLength(2);
    expect(frets(events[0])).toBe("x32010");
    expect(frets(events[1])).toBe("320003");
  });

  it("ignores a quiet sub-bass ghost when picking the bass note", () => {
    const notes = [...strum([48, 52, 55, 60, 64]), ...strum([43], 0.02, 0.18)];
    const [event] = detectChordTimeline(notes, 0.15);

    expect(event?.chord).not.toContain("/");
    expect(event?.bassNote).toBe("C3");
  });

  it("keeps a progression's shapes in one neck position", () => {
    // A-shape C barre at fret 3, then a G triad that is playable open or at fret 3-5.
    const notes = [...strum([48, 55, 60, 64, 67]), ...strum([55, 59, 62], 1)];
    const events = detectChordTimeline(notes, 0.15);

    expect(frets(events[0])).toBe("x35553");
    expect(frets(events[1])).toBe("xx543x");
  });
});

describe("describeInversion", () => {
  it("names root position and inversions of triads and sevenths", () => {
    expect(describeInversion("C", "C")).toBe("Root position");
    expect(describeInversion("C/E", "E")).toBe("1st inversion");
    expect(describeInversion("C/G", "G")).toBe("2nd inversion");
    expect(describeInversion("G7/F", "F")).toBe("3rd inversion");
    expect(describeInversion("Am/C", "C")).toBe("1st inversion");
  });

  it("falls back to naming the bass note when it is not a chord tone", () => {
    expect(describeInversion("C/D", "D")).toBe("D in the bass");
  });

  it("returns null without a chord or bass", () => {
    expect(describeInversion(null, "C")).toBeNull();
    expect(describeInversion("C", undefined)).toBeNull();
  });
});

describe("dominantChordEvent", () => {
  it("returns the longest event, matching detectChordsWindowed", () => {
    const notes = [...strum([48, 52, 55, 60, 64]), ...strum([43, 47, 50, 55, 59, 67], 2)];
    const events = detectChordTimeline(notes, 0.15);
    events[1] = { ...events[1]!, endTimeS: events[1]!.startTimeS + 5 };

    expect(dominantChordEvent(events)).toBe(events[1]);
    expect(dominantChordEvent([])).toBeNull();
  });
});

describe("describeVoicing", () => {
  it("joins the inversion and the note stack", () => {
    expect(describeVoicing({ chord: "CM/E", bassNote: "E3", notes: ["E3", "G3", "C4"] })).toBe("1st inversion · E3 G3 C4");
  });

  it("works for sessions saved before voicings existed", () => {
    expect(describeVoicing({ chord: "CM" })).toBeNull();
    expect(describeVoicing(null)).toBeNull();
  });
});
