import { describe, expect, it } from "vitest";
import { extendStrumPlaybackDurations } from "./guitarStrumPlayback";
import type { MappedNote } from "./noteMapper";

function note(overrides: Partial<MappedNote> = {}): MappedNote {
  return {
    midi: 60,
    name: "C4",
    pitchClass: "C",
    octave: 4,
    startTimeS: 0,
    durationS: 0.2,
    amplitude: 0.5,
    ...overrides,
  };
}

describe("extendStrumPlaybackDurations", () => {
  it("extends shorter notes to share the latest release within a cluster", () => {
    const notes = [
      note({ startTimeS: 0.0, durationS: 0.2 }),
      note({ startTimeS: 0.08, durationS: 0.35 }),
    ];
    const baseDurations = [0.3, 0.47];

    const result = extendStrumPlaybackDurations(notes, baseDurations, 0.15);
    expect(result[0]).toBeCloseTo(0.47 + 0.08, 5); // 0.55 target end minus 0 start
    expect(result[1]).toBeCloseTo(0.47, 5); // longest note unchanged
  });

  it("leaves separate clusters unchanged", () => {
    const notes = [
      note({ startTimeS: 0.0 }),
      note({ startTimeS: 0.08 }),
      note({ startTimeS: 0.5 }),
    ];
    const baseDurations = [0.3, 0.3, 0.4];

    const result = extendStrumPlaybackDurations(notes, baseDurations, 0.1);
    expect(result.slice(0, 2)).not.toEqual(baseDurations.slice(0, 2));
    expect(result[2]).toBe(baseDurations[2]);
  });

  it("returns base durations when window is zero", () => {
    const notes = [note()];
    const baseDurations = [0.3];
    const result = extendStrumPlaybackDurations(notes, baseDurations, 0);
    expect(result).toEqual(baseDurations);
  });
});
