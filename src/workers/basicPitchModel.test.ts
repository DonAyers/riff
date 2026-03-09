import { describe, expect, it, vi } from "vitest";

import { createBundledModelUrl, rewriteWeightsManifestPaths } from "./basicPitchModel";

describe("rewriteWeightsManifestPaths", () => {
  it("replaces relative shard paths with emitted asset urls", () => {
    const manifest = {
      modelTopology: { version: 1 },
      weightsManifest: [
        {
          paths: ["group1-shard1of1.bin"],
          weights: [{ name: "weight-a" }],
        },
      ],
    };

    expect(rewriteWeightsManifestPaths(manifest, ["/assets/group1-shard1of1.bin"]))
      .toMatchObject({
        weightsManifest: [
          {
            paths: ["/assets/group1-shard1of1.bin"],
          },
        ],
      });
  });

  it("throws when the manifest expects more shard paths than were bundled", () => {
    const manifest = {
      modelTopology: { version: 1 },
      weightsManifest: [
        {
          paths: ["group1-shard1of1.bin", "group1-shard1of2.bin"],
          weights: [],
        },
      ],
    };

    expect(() => rewriteWeightsManifestPaths(manifest, ["/assets/one.bin"]))
      .toThrow("Missing bundled model weight URL");
  });
});

describe("createBundledModelUrl", () => {
  it("rewrites the fetched manifest before creating a blob url", async () => {
    let capturedBlob = new Blob();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          modelTopology: { version: 1 },
          weightsManifest: [
            {
              paths: ["group1-shard1of1.bin"],
              weights: [{ name: "weight-a" }],
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    const createObjectUrl = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "blob:model";
    });

    const url = await createBundledModelUrl({
      manifestUrl: "/assets/model.json",
      weightUrls: ["/assets/group1-shard1of1.bin"],
      fetchImpl,
      createObjectUrl,
    });

    expect(url).toBe("blob:model");
    expect(fetchImpl).toHaveBeenCalledWith("/assets/model.json");
    expect(createObjectUrl).toHaveBeenCalledOnce();

    const manifestText = await capturedBlob.text();
    expect(manifestText).toContain("/assets/group1-shard1of1.bin");
  });
});