import { describe, expect, it, vi } from "vitest";

import { loadBundledGraphModel } from "./basicPitchModel";

describe("loadBundledGraphModel", () => {
  it("loads the graph model from fetched manifest and weight bytes", async () => {
    const weightBytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("model.json")) {
        return new Response(
          JSON.stringify({
            modelTopology: { version: 1 },
            weightsManifest: [
              {
                paths: ["group1-shard1of1.bin"],
                weights: [{ name: "weight-a", shape: [1], dtype: "float32" }],
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      return new Response(weightBytes, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    });
    const ioHandler = { load: vi.fn() };
    const fromMemoryImpl = vi.fn(() => ioHandler as never);
    const model = { execute: vi.fn() };
    const loadGraphModelImpl = vi.fn(async () => model as never);

    const result = await loadBundledGraphModel({
      manifestUrl: "/assets/model.json",
      weightUrls: ["/assets/group1-shard1of1.bin"],
      fetchImpl: fetchImpl as typeof fetch,
      fromMemoryImpl,
      loadGraphModelImpl,
    });

    expect(result).toBe(model);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, "/assets/model.json");
    expect(fetchImpl).toHaveBeenNthCalledWith(2, "/assets/group1-shard1of1.bin");
    expect(fromMemoryImpl).toHaveBeenCalledOnce();

    const firstCall = fromMemoryImpl.mock.calls[0] as unknown[] | undefined;
    if (!firstCall) {
      throw new Error("Expected fromMemory to be called");
    }

    expect(firstCall[0]).toEqual({ version: 1 });
    expect(firstCall[1]).toEqual([
      { name: "weight-a", shape: [1], dtype: "float32" },
    ]);
    expect(new Uint8Array(firstCall[2] as ArrayBuffer)).toEqual(weightBytes);
    expect(loadGraphModelImpl).toHaveBeenCalledWith(ioHandler);
  });

  it("surfaces manifest fetch failures clearly", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 503 }));

    await expect(
      loadBundledGraphModel({
        manifestUrl: "/assets/model.json",
        weightUrls: ["/assets/group1-shard1of1.bin"],
        fetchImpl: fetchImpl as typeof fetch,
      })
    ).rejects.toThrow("Failed to load model manifest: 503");
  });
});