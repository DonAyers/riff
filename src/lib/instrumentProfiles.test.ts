import { describe, expect, it } from "vitest";
import {
  normalizeProfileId,
  normalizeStoredProfileId,
  PROFILES,
  PROFILE_IDS,
  type ProfileId,
} from "./instrumentProfiles";

describe("instrumentProfiles", () => {
  it("exposes only the shared default and guitar profile ids", () => {
    expect(PROFILE_IDS).toEqual(["default", "guitar"]);
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

  it("falls back to the guitar-first profile for stale or unknown ids", () => {
    expect(normalizeProfileId("default")).toBe("default");
    expect(normalizeProfileId("guitar")).toBe("guitar");
    // Preserve a smooth upgrade path for older installs that still have the
    // removed piano profile persisted locally.
    expect(normalizeProfileId("piano")).toBe("guitar");
    expect(normalizeProfileId("banjo")).toBe("guitar");
    expect(normalizeProfileId(null)).toBe("guitar");
  });

  it("marks only stale stored profile ids for migration cleanup", () => {
    expect(normalizeStoredProfileId("default")).toEqual({ profileId: "default", didMigrate: false });
    expect(normalizeStoredProfileId("guitar")).toEqual({ profileId: "guitar", didMigrate: false });
    expect(normalizeStoredProfileId("piano")).toEqual({ profileId: "guitar", didMigrate: true });
    expect(normalizeStoredProfileId("banjo")).toEqual({ profileId: "guitar", didMigrate: true });
    expect(normalizeStoredProfileId(null)).toEqual({ profileId: "guitar", didMigrate: false });
    expect(normalizeStoredProfileId(undefined)).toEqual({ profileId: "guitar", didMigrate: false });
  });
});
