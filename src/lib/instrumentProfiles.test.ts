import { describe, expect, it } from "vitest";
import { PROFILES, PROFILE_IDS, type ProfileId } from "./instrumentProfiles";

describe("instrumentProfiles", () => {
  it("exposes default, guitar, and piano profile ids", () => {
    expect(PROFILE_IDS).toContain("default");
    expect(PROFILE_IDS).toContain("guitar");
    expect(PROFILE_IDS).toContain("piano");
  });

  it.each(PROFILE_IDS)("profile '%s' has valid midi range", (id: ProfileId) => {
    const p = PROFILES[id];
    expect(p.midiRange[0]).toBeLessThan(p.midiRange[1]);
    expect(p.maxPolyphony).toBeGreaterThan(0);
    expect(p.confidenceThreshold).toBeGreaterThan(0);
    expect(p.onsetThreshold).toBeGreaterThan(0);
  });

  it("guitar profile has polyphony of 6 (6 strings)", () => {
    expect(PROFILES.guitar.maxPolyphony).toBe(6);
  });

  it("guitar profile filters out low sub-bass notes", () => {
    expect(PROFILES.guitar.midiRange[0]).toBeGreaterThanOrEqual(40);
  });
});
