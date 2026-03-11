import { describe, expect, it } from "vitest";
import { lookupVoicings } from "./chordVoicings";

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