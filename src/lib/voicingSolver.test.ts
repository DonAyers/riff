import { describe, expect, it } from "vitest";
import {
  chooseVoicingPath,
  scorePlayability,
  solveVoicing,
  voicingMidiNotes,
  type VoicingCandidate,
} from "./voicingSolver";
import type { GuitarVoicing } from "./chordVoicings";

const shape = (voicing: GuitarVoicing | null | undefined) => voicing?.frets.map((fret) => (fret < 0 ? "x" : String(fret))).join(" ");
const notes = (...midis: number[]) => midis.map((midi) => ({ midi, amplitude: 0.8 }));

describe("voicingMidiNotes", () => {
  it("reads open C as C3 E3 G3 C4 E4 in standard tuning", () => {
    expect(voicingMidiNotes([-1, 3, 2, 0, 1, 0])).toEqual([48, 52, 55, 60, 64]);
  });
});

describe("scorePlayability", () => {
  it("accepts common open and barre shapes", () => {
    expect(scorePlayability([-1, 3, 2, 0, 1, 0])).not.toBeNull();
    expect(scorePlayability([8, 10, 10, 9, 8, 8])).not.toBeNull();
    expect(scorePlayability([-1, 3, 5, 5, 5, 3])).not.toBeNull();
  });

  it("rejects stretches wider than five frets", () => {
    expect(scorePlayability([1, -1, -1, -1, -1, 7])).toBeNull();
  });

  it("rejects five fretted notes that no barre can cover", () => {
    // Needs five separate fingers: the lowest fret only appears on one string.
    expect(scorePlayability([1, 2, 3, 2, 3, -1])).toBeNull();
  });

  it("rejects a barre with an open string ringing underneath it", () => {
    expect(scorePlayability([3, 5, 0, 4, 3, 3])).toBeNull();
  });

  it("prefers open position over the same notes higher up the neck", () => {
    expect(scorePlayability([-1, 3, 2, 0, 1, 0])!).toBeLessThan(scorePlayability([-1, 3, 5, 5, 5, 3])!);
  });
});

describe("solveVoicing", () => {
  it("finds open C from C3 E3 G3 C4 E4", () => {
    expect(shape(solveVoicing(notes(48, 52, 55, 60, 64), "C")[0]?.voicing)).toBe("x 3 2 0 1 0");
  });

  it("finds C/G with the low G on the sixth string", () => {
    expect(shape(solveVoicing(notes(43, 48, 52, 55, 60, 64), "C/G")[0]?.voicing)).toBe("3 3 2 0 1 0");
  });

  it("finds the A-shape barre at fret 3 from its pitches", () => {
    expect(shape(solveVoicing(notes(48, 55, 60, 64, 67), "C")[0]?.voicing)).toBe("x 3 5 5 5 3");
  });

  it("finds the E-shape barre at fret 8 from its pitches", () => {
    expect(shape(solveVoicing(notes(48, 55, 60, 64, 67, 72), "C")[0]?.voicing)).toBe("8 10 10 9 8 8");
  });

  it("fills in an open string Basic Pitch missed when a known shape explains the rest", () => {
    // Open C with the G string (55) missing from detection.
    const [best] = solveVoicing(notes(48, 52, 60, 64), "C");
    expect(shape(best?.voicing)).toBe("x 3 2 0 1 0");
    expect(best?.unheard).toBe(1);
    expect(best?.missing).toBe(0);
  });

  it("treats quiet octaves and twelfths above chord tones as overtones, not extra strings", () => {
    const heard = [
      ...notes(48, 52, 55, 60, 64),
      { midi: 67, amplitude: 0.4 },
      { midi: 72, amplitude: 0.35 },
      { midi: 76, amplitude: 0.3 },
    ];
    expect(shape(solveVoicing(heard, "C")[0]?.voicing)).toBe("x 3 2 0 1 0");
  });

  it("keeps doubled notes that ring as loud as the note below, as in a barre chord", () => {
    expect(shape(solveVoicing(notes(43, 50, 55, 59, 62, 67), "G")[0]?.voicing)).toBe("3 5 5 4 3 3");
  });

  it("solves shapes the library does not know, such as drop-D power chords in standard tuning", () => {
    const [best] = solveVoicing(notes(45, 52, 57), "A5");
    expect(best?.missing).toBe(0);
    expect(voicingMidiNotes(best!.voicing.frets)).toEqual([45, 52, 57]);
  });

  it("returns nothing for an empty note set", () => {
    expect(solveVoicing([], "C")).toEqual([]);
  });

  it("marks barres and a base fret on solved shapes high on the neck", () => {
    const voicing = solveVoicing(notes(48, 55, 60, 64, 67, 72), "C")[0]!.voicing;
    expect(voicing.barres).toEqual([8]);
    expect(voicing.baseFret).toBe(8);
  });
});

describe("chooseVoicingPath", () => {
  const candidate = (frets: GuitarVoicing["frets"], cost: number): VoicingCandidate => ({
    voicing: { frets, fingers: [0, 0, 0, 0, 0, 0], barres: [], baseFret: 1 },
    cost,
    missing: 0,
    unheard: 0,
  });

  it("stays near the previous chord's neck position when the costs are close", () => {
    const highG = candidate([-1, -1, 5, 4, 3, -1], 2);
    const path = chooseVoicingPath([
      [candidate([-1, -1, 7, 7, 7, -1], 1)],
      [candidate([-1, -1, 0, 0, 0, 3], 1.8), highG],
    ]);
    expect(path[1]).toBe(highG);
  });

  it("keeps a lone chord's cheapest shape and passes empty events through", () => {
    const cheap = candidate([-1, 3, 2, 0, 1, 0], 1);
    const path = chooseVoicingPath([[cheap, candidate([-1, 3, 5, 5, 5, 3], 3)], []]);
    expect(path).toEqual([cheap, null]);
  });
});
