import { describe, expect, it } from "vitest";
import { buildPitchClassHistogram, detectKey } from "./keyDetector";
import type { MappedNote } from "./noteMapper";

function note(pitchClass: string, midi: number, startTimeS: number): MappedNote {
  return {
    midi,
    name: `${pitchClass}4`,
    pitchClass,
    octave: 4,
    startTimeS,
    durationS: 0.4,
    amplitude: 0.8,
  };
}

describe("keyDetector", () => {
  it("builds a pitch class histogram from mapped notes", () => {
    const histogram = buildPitchClassHistogram([
      note("C", 60, 0),
      note("E", 64, 0.2),
      note("C", 72, 0.4),
    ]);

    expect(histogram[0]).toBe(2);
    expect(histogram[4]).toBe(1);
  });

  it("detects C major from a C major scale collection", () => {
    const result = detectKey([
      note("C", 60, 0),
      note("D", 62, 0.2),
      note("E", 64, 0.4),
      note("F", 65, 0.6),
      note("G", 67, 0.8),
      note("A", 69, 1),
      note("B", 71, 1.2),
      note("C", 72, 1.4),
    ]);

    expect(result.primary?.label).toBe("C Major");
    expect(result.lowConfidence).toBe(false);
  });

  it("detects A minor from an A minor scale collection", () => {
    const result = detectKey([
      note("A", 69, 0),
      note("B", 71, 0.2),
      note("C", 72, 0.4),
      note("D", 74, 0.6),
      note("E", 76, 0.8),
      note("F", 77, 1),
      note("G", 79, 1.2),
      note("A", 81, 1.4),
    ]);

    expect(result.primary?.label).toBe("A Minor");
    expect(result.lowConfidence).toBe(false);
  });

  it("marks short ambiguous input as low confidence", () => {
    const result = detectKey([
      note("C", 60, 0),
      note("E", 64, 0.2),
      note("G", 67, 0.4),
    ]);

    expect(result.primary?.label).toBeTruthy();
    expect(result.lowConfidence).toBe(true);
  });

  it("returns no primary key for empty input", () => {
    const result = detectKey([]);

    expect(result.primary).toBeNull();
    expect(result.ranked).toHaveLength(0);
    expect(result.lowConfidence).toBe(true);
  });
});