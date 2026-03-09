import { describe, expect, it, vi, beforeEach } from "vitest";
import { detectBestCodec, mimeToExtension } from "./audioEncoder";

describe("detectBestCodec", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns webm/opus when supported", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (mime: string) => mime === "audio/webm;codecs=opus",
    });
    expect(detectBestCodec()).toBe("audio/webm;codecs=opus");
  });

  it("falls back to mp4/aac when webm/opus is not supported", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (mime: string) => mime === "audio/mp4;codecs=aac",
    });
    expect(detectBestCodec()).toBe("audio/mp4;codecs=aac");
  });

  it("falls back to plain webm when specific codecs are not supported", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: (mime: string) => mime === "audio/webm",
    });
    expect(detectBestCodec()).toBe("audio/webm");
  });

  it("returns null when MediaRecorder is not available", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(detectBestCodec()).toBeNull();
  });

  it("returns null when no codec is supported", () => {
    vi.stubGlobal("MediaRecorder", {
      isTypeSupported: () => false,
    });
    expect(detectBestCodec()).toBeNull();
  });
});

describe("mimeToExtension", () => {
  it("maps webm types to .webm", () => {
    expect(mimeToExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(mimeToExtension("audio/webm")).toBe("webm");
  });

  it("maps mp4 types to .m4a", () => {
    expect(mimeToExtension("audio/mp4;codecs=aac")).toBe("m4a");
  });

  it("maps ogg types to .ogg", () => {
    expect(mimeToExtension("audio/ogg;codecs=opus")).toBe("ogg");
  });

  it("returns bin for unknown types", () => {
    expect(mimeToExtension("audio/flac")).toBe("bin");
  });
});
