import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDeleteAudioBlobFromIndexedDB,
  mockReadAudioBlobFromIndexedDB,
  mockSaveAudioBlobToIndexedDB,
} = vi.hoisted(() => ({
  mockDeleteAudioBlobFromIndexedDB: vi.fn(),
  mockReadAudioBlobFromIndexedDB: vi.fn(),
  mockSaveAudioBlobToIndexedDB: vi.fn(),
}));

vi.mock("./db", () => ({
  deleteAudioBlobFromIndexedDB: mockDeleteAudioBlobFromIndexedDB,
  readAudioBlobFromIndexedDB: mockReadAudioBlobFromIndexedDB,
  saveAudioBlobToIndexedDB: mockSaveAudioBlobToIndexedDB,
}));

import {
  deleteStoredAudio,
  readBlobFromOpfs,
  readPcmFromOpfs,
  saveBlobToOpfs,
  savePcmToOpfs,
} from "./audioStorage";

type MockOpfsRoot = {
  getFileHandle?: ReturnType<typeof vi.fn>;
  removeEntry?: ReturnType<typeof vi.fn>;
};

function setNavigatorStorage(rootFactory?: () => Promise<MockOpfsRoot>) {
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: rootFactory
      ? {
          getDirectory: vi.fn(rootFactory),
        }
      : undefined,
  });
}

describe("audioStorage", () => {
  beforeEach(() => {
    mockDeleteAudioBlobFromIndexedDB.mockReset().mockResolvedValue(undefined);
    mockReadAudioBlobFromIndexedDB.mockReset().mockResolvedValue(null);
    mockSaveAudioBlobToIndexedDB.mockReset().mockResolvedValue(true);
    setNavigatorStorage();
  });

  it("falls back to IndexedDB when PCM audio cannot use OPFS", async () => {
    const pcm = new Float32Array([0.25, -0.5, 0.75]);

    await expect(savePcmToOpfs("riff-1.f32", pcm)).resolves.toBe(true);

    expect(mockSaveAudioBlobToIndexedDB).toHaveBeenCalledTimes(1);
    expect(mockSaveAudioBlobToIndexedDB).toHaveBeenCalledWith(
      "riff-1.f32",
      expect.any(Blob),
    );

    const savedBlob = mockSaveAudioBlobToIndexedDB.mock.calls[0]?.[1];
    expect(savedBlob).toBeInstanceOf(Blob);
    expect(savedBlob?.type).toBe("application/octet-stream");
    expect(Array.from(new Float32Array(await savedBlob.arrayBuffer()))).toEqual(
      Array.from(pcm),
    );
  });

  it("reads PCM audio from IndexedDB when OPFS read fails", async () => {
    const pcm = new Float32Array([0.1, 0.2, -0.3]);
    const root = {
      getFileHandle: vi.fn().mockRejectedValue(new Error("missing")),
    };

    setNavigatorStorage(async () => root);
    mockReadAudioBlobFromIndexedDB.mockResolvedValue(
      new Blob([new Float32Array(pcm).buffer], {
        type: "application/octet-stream",
      }),
    );

    await expect(readPcmFromOpfs("riff-2.f32")).resolves.toEqual(pcm);
    expect(mockReadAudioBlobFromIndexedDB).toHaveBeenCalledWith("riff-2.f32");
  });

  it("keeps using OPFS for compressed audio when writes succeed", async () => {
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const root = {
      getFileHandle: vi.fn().mockResolvedValue({
        createWritable: vi.fn().mockResolvedValue(writable),
      }),
    };
    const blob = new Blob(["riff"], { type: "audio/webm;codecs=opus" });

    setNavigatorStorage(async () => root);

    await expect(saveBlobToOpfs("riff-3.webm", blob)).resolves.toBe(true);
    expect(writable.write).toHaveBeenCalledWith(blob);
    expect(mockSaveAudioBlobToIndexedDB).not.toHaveBeenCalled();
  });

  it("reads compressed audio from IndexedDB fallback with the requested mime", async () => {
    mockReadAudioBlobFromIndexedDB.mockResolvedValue(
      new Blob(["riff"], { type: "application/octet-stream" }),
    );

    const blob = await readBlobFromOpfs("riff-4.webm", "audio/webm;codecs=opus");

    expect(mockReadAudioBlobFromIndexedDB).toHaveBeenCalledWith("riff-4.webm");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe("audio/webm;codecs=opus");
    await expect(blob?.text()).resolves.toBe("riff");
  });

  it("cleans up both OPFS and IndexedDB audio copies on delete", async () => {
    const root = {
      removeEntry: vi.fn().mockResolvedValue(undefined),
    };

    setNavigatorStorage(async () => root);

    await deleteStoredAudio("riff-5.webm");

    expect(root.removeEntry).toHaveBeenCalledWith("riff-5.webm");
    expect(mockDeleteAudioBlobFromIndexedDB).toHaveBeenCalledWith("riff-5.webm");
  });
});
