import { describe, expect, it } from "vitest";
import { detectStorageEvictionRisk, isStorageEvictionRiskLikely } from "./storageEvictionRisk";

const iPhoneSafariUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("storageEvictionRisk", () => {
  it("flags Apple mobile browsers when persistent storage is not granted", () => {
    expect(
      isStorageEvictionRiskLikely({
        userAgent: iPhoneSafariUserAgent,
        vendor: "Apple Computer, Inc.",
        platform: "iPhone",
        maxTouchPoints: 5,
        persistentStorageGranted: false,
      }),
    ).toBe(true);
  });

  it("treats touch Macs as iPad-class browsers", () => {
    expect(
      isStorageEvictionRiskLikely({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        vendor: "Apple Computer, Inc.",
        platform: "MacIntel",
        maxTouchPoints: 5,
        persistentStorageGranted: null,
      }),
    ).toBe(true);
  });

  it("does not flag desktop browsers by default", () => {
    expect(
      isStorageEvictionRiskLikely({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        vendor: "Google Inc.",
        platform: "Win32",
        maxTouchPoints: 0,
        persistentStorageGranted: false,
      }),
    ).toBe(false);
  });

  it("clears the warning when persistent storage is already granted", () => {
    expect(
      isStorageEvictionRiskLikely({
        userAgent: iPhoneSafariUserAgent,
        vendor: "Apple Computer, Inc.",
        platform: "iPhone",
        maxTouchPoints: 5,
        persistentStorageGranted: true,
      }),
    ).toBe(false);
  });

  it("reads persisted storage support when available", async () => {
    await expect(
      detectStorageEvictionRisk({
        userAgent: iPhoneSafariUserAgent,
        vendor: "Apple Computer, Inc.",
        platform: "iPhone",
        maxTouchPoints: 5,
        storage: {
          persisted: async () => false,
        },
      }),
    ).resolves.toBe(true);
  });

  it("falls back cleanly when persisted storage detection throws", async () => {
    await expect(
      detectStorageEvictionRisk({
        userAgent: iPhoneSafariUserAgent,
        vendor: "Apple Computer, Inc.",
        platform: "iPhone",
        maxTouchPoints: 5,
        storage: {
          persisted: async () => {
            throw new Error("nope");
          },
        },
      }),
    ).resolves.toBe(true);
  });
});
