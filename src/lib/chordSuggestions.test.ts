import { describe, expect, it } from "vitest";
import { getChordSuggestions } from "./chordSuggestions";

describe("getChordSuggestions", () => {
  it("returns categorized suggestions for a formatted major chord label", () => {
    const result = getChordSuggestions("C Major");

    expect(result.parsed).toEqual(expect.objectContaining({ tonic: "C", quality: "major" }));
    expect(result.unsupportedReason).toBeUndefined();
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "variate", chord: "Am", relationship: "relative minor" }),
        expect.objectContaining({ category: "spice-up", chord: "Cmaj7", relationship: "major seventh" }),
        expect.objectContaining({ category: "phrasing", chord: "C/E", relationship: "first inversion" }),
      ]),
    );
  });

  it("returns categorized suggestions for a formatted minor chord label", () => {
    const result = getChordSuggestions("A Minor");

    expect(result.parsed).toEqual(expect.objectContaining({ tonic: "A", quality: "minor" }));
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "variate", chord: "C", relationship: "relative major" }),
        expect.objectContaining({ category: "spice-up", chord: "Am9", relationship: "minor ninth" }),
        expect.objectContaining({ category: "spice-down", chord: "A5", relationship: "power chord" }),
      ]),
    );
  });

  it("accepts symbol-like detected labels", () => {
    const result = getChordSuggestions("G7");

    expect(result.parsed).toEqual(expect.objectContaining({ tonic: "G", quality: "dominant" }));
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "variate", relationship: "tritone substitution" }),
        expect.objectContaining({ category: "spice-up", chord: "G9" }),
        expect.objectContaining({ category: "spice-down", chord: "GM" }),
      ]),
    );
  });

  it("returns a structured no-result for unsupported chord labels", () => {
    expect(getChordSuggestions("Not A Chord")).toEqual({
      input: "Not A Chord",
      parsed: null,
      suggestions: [],
      unsupportedReason: "Unsupported chord label",
    });

    expect(getChordSuggestions(null)).toEqual({
      input: null,
      parsed: null,
      suggestions: [],
      unsupportedReason: "Missing chord label",
    });
  });

  it("filters suggestions by category and per-category limit", () => {
    const result = getChordSuggestions("F Major", {
      categories: ["spice-up"],
      limitPerCategory: 2,
    });

    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.every((suggestion) => suggestion.category === "spice-up")).toBe(true);
    expect(result.suggestions.map((suggestion) => suggestion.chord)).toEqual(["Fmaj7", "Fadd9"]);
  });

  it("includes modal color and spice suggestions for major chords", () => {
    const result = getChordSuggestions("C Major");

    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "variate",
          chord: "Cm",
          relationship: "parallel minor",
        }),
        expect.objectContaining({
          category: "spice-up",
          chord: "Cadd9",
          relationship: "added ninth",
        }),
      ]),
    );
  });

  it("uses the shared chord formatter for suggestion display names", () => {
    const result = getChordSuggestions("C Major");

    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chord: "Cmaj7", displayName: "C major 7" }),
        expect.objectContaining({ chord: "Cadd9", displayName: "C add9" }),
        expect.objectContaining({ chord: "C6", displayName: "C sixth" }),
        expect.objectContaining({ chord: "C5", displayName: "C power chord" }),
      ]),
    );
  });

  it("preserves richer dominant and minor extension names in suggestions", () => {
    expect(getChordSuggestions("G7").suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chord: "G9", displayName: "G dominant 9" }),
        expect.objectContaining({ chord: "G13", displayName: "G dominant 13" }),
      ]),
    );

    expect(getChordSuggestions("A Minor").suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ chord: "Am9", displayName: "A minor 9" }),
        expect.objectContaining({ chord: "Am11", displayName: "A minor 11" }),
      ]),
    );
  });
});
