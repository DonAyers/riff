import { describe, expect, it } from "vitest";
import { getVariateSuggestions } from "./chordSubstitutions";

describe("getVariateSuggestions", () => {
  it("suggests relative minor and sus chords for Major", () => {
    const suggestions = getVariateSuggestions("C Major");
    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Am", type: "relative" }),
        expect.objectContaining({ name: "Csus2", type: "sus" }),
        expect.objectContaining({ name: "Cmaj7", type: "seventh" }),
      ]),
    );
  });

  it("suggests relative major for minor", () => {
    const suggestions = getVariateSuggestions("A minor");
    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "C", type: "relative" }),
        expect.objectContaining({ name: "Am7", type: "seventh" }),
      ]),
    );
  });

  it("suggests tritone substitution for dominant 7ths", () => {
    const suggestions = getVariateSuggestions("G7");
    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "tritone" }),
      ]),
    );
  });

  it("returns empty array for invalid chords", () => {
    expect(getVariateSuggestions("")).toEqual([]);
    expect(getVariateSuggestions("Not A Chord")).toEqual([]);
  });
});