import { describe, expect, it } from "vitest";
import { detectChord, formatChordName } from "./chordDetector";

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
