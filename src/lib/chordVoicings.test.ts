import { describe, expect, it } from "vitest";
import { lookupVoicings, voicingsForChord, type GuitarVoicing } from "./chordVoicings";

describe("lookupVoicings", () => {
  it("returns voicings for a tonal symbol", () => {
    const voicings = lookupVoicings("CM");

    expect(voicings.length).toBeGreaterThan(0);
    expect(voicings[0]?.frets).toEqual([-1, 3, 2, 0, 1, 0]);
  });

  it("returns voicings for a formatted chord label", () => {
    const voicings = lookupVoicings("A Minor");

    expect(voicings.length).toBeGreaterThan(0);
  });

  it("returns alternate voicings when available", () => {
    const voicings = lookupVoicings("G7");

    expect(voicings.length).toBeGreaterThanOrEqual(2);
  });

  it("returns voicings for dynamically supported chords like sus4", () => {
    const voicings = lookupVoicings("Bb sus4");
    expect(voicings.length).toBeGreaterThan(0);
  });
});
describe("lookupVoicings with inversions", () => {
  it("finds shapes for a formatted slash-chord label", () => {
    expect(lookupVoicings("C Major/G")[0]?.frets).toEqual([-1, 3, 2, 0, 1, 0]);
    expect(lookupVoicings("A Minor/C").length).toBeGreaterThan(0);
  });
});

describe("voicingsForChord", () => {
  const playedCOverG: GuitarVoicing = { frets: [3, 3, 2, 0, 1, 0], fingers: [3, 4, 2, 0, 1, 0], barres: [], baseFret: 1 };

  it("puts the played shape first, ahead of the saved shapes", () => {
    const voicings = voicingsForChord("C Major/G", playedCOverG);

    expect(voicings[0]).toBe(playedCOverG);
    expect(voicings.length).toBe(lookupVoicings("C Major/G").length + 1);
  });

  it("does not repeat a saved shape that matches the played one", () => {
    const savedOpenC = lookupVoicings("CM")[0]!;
    const voicings = voicingsForChord("CM", { ...savedOpenC, fingers: [0, 0, 0, 0, 0, 0] });

    expect(voicings.filter((voicing) => voicing.frets.join() === savedOpenC.frets.join())).toHaveLength(1);
    expect(voicings.length).toBe(lookupVoicings("CM").length);
  });

  it("falls back to saved shapes when nothing was played", () => {
    expect(voicingsForChord("CM", undefined)).toEqual(lookupVoicings("CM"));
  });
});
