import { describe, expect, it, vi, beforeEach } from "vitest";
import { decodeAudioFile } from "./audioImport";

// Mock Web Audio APIs that jsdom doesn't provide

function makeMockAudioBuffer(options: {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  channelData: Float32Array[];
}): AudioBuffer {
  return {
    numberOfChannels: options.numberOfChannels,
    length: options.length,
    sampleRate: options.sampleRate,
    duration: options.length / options.sampleRate,
    getChannelData: (ch: number) => options.channelData[ch],
  } as unknown as AudioBuffer;
}

const mockClose = vi.fn().mockResolvedValue(undefined);
let mockDecodeResult: AudioBuffer;

// Must use function (not arrow) so `new AudioContext()` works
vi.stubGlobal(
  "AudioContext",
  function MockAudioContext(this: Record<string, unknown>) {
    this.decodeAudioData = vi.fn().mockImplementation(() => Promise.resolve(mockDecodeResult));
    this.close = mockClose;
  },
);

let offlineRenderResult: AudioBuffer;

vi.stubGlobal(
  "OfflineAudioContext",
  function MockOfflineAudioContext(this: Record<string, unknown>) {
    this.createBuffer = vi.fn().mockImplementation((_ch: number, length: number, sr: number) =>
      makeMockAudioBuffer({
        numberOfChannels: 1,
        length,
        sampleRate: sr,
        channelData: [new Float32Array(length)],
      }),
    );
    this.createBufferSource = vi.fn().mockReturnValue({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
    });
    this.destination = {};
    this.startRendering = vi.fn().mockImplementation(() => Promise.resolve(offlineRenderResult));
  },
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("decodeAudioFile", () => {
  it("rejects oversized files before decoding", async () => {
    const file = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "huge.wav", { type: "audio/wav" });

    await expect(decodeAudioFile(file)).rejects.toThrow(/under 25 mb/i);
    expect(mockClose).not.toHaveBeenCalled();
  });

  it("returns a Float32Array from a mono file at target sample rate", async () => {
    const pcm = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    mockDecodeResult = makeMockAudioBuffer({
      numberOfChannels: 1,
      length: 5,
      sampleRate: 22050,
      channelData: [pcm],
    });

    const file = new File([new ArrayBuffer(10)], "test.wav", { type: "audio/wav" });
    const result = await decodeAudioFile(file);

    expect(result.analysisAudio).toBeInstanceOf(Float32Array);
    expect(result.analysisAudio.length).toBe(5);
    expect(result.analysisAudio[0]).toBeCloseTo(0.1);
    expect(result.storedAudio).toEqual(pcm);
    expect(result.storedSampleRate).toBe(22050);
    expect(result.analysisAudio).not.toBe(result.storedAudio);
  });

  it("mixes stereo to mono by averaging channels", async () => {
    const left = new Float32Array([1.0, 0.0, 0.5]);
    const right = new Float32Array([0.0, 1.0, 0.5]);
    mockDecodeResult = makeMockAudioBuffer({
      numberOfChannels: 2,
      length: 3,
      sampleRate: 22050,
      channelData: [left, right],
    });

    const file = new File([new ArrayBuffer(10)], "stereo.wav", { type: "audio/wav" });
    const result = await decodeAudioFile(file);

    expect(result.analysisAudio.length).toBe(3);
    expect(result.analysisAudio[0]).toBeCloseTo(0.5); // (1.0 + 0.0) / 2
    expect(result.analysisAudio[1]).toBeCloseTo(0.5); // (0.0 + 1.0) / 2
    expect(result.analysisAudio[2]).toBeCloseTo(0.5); // (0.5 + 0.5) / 2
    expect(result.storedAudio).toEqual(result.analysisAudio);
  });

  it("resamples when input sample rate differs from 22050", async () => {
    const pcm = new Float32Array(44100); // 1 second at 44100 Hz
    mockDecodeResult = makeMockAudioBuffer({
      numberOfChannels: 1,
      length: 44100,
      sampleRate: 44100,
      channelData: [pcm],
    });

    const resampledPcm = new Float32Array(22050);
    offlineRenderResult = makeMockAudioBuffer({
      numberOfChannels: 1,
      length: 22050,
      sampleRate: 22050,
      channelData: [resampledPcm],
    });

    const file = new File([new ArrayBuffer(10)], "high-sr.wav", { type: "audio/wav" });
    const result = await decodeAudioFile(file);

    expect(result.analysisAudio.length).toBe(22050);
    expect(result.storedAudio.length).toBe(44100);
    expect(result.storedSampleRate).toBe(44100);
  });

  it("trims audio longer than 120 seconds using the native sample rate", async () => {
    const sampleRate = 44100;
    const longLength = sampleRate * 150; // 150 seconds
    const maxNativeLength = sampleRate * 120; // 120 second cap
    const pcm = new Float32Array(longLength);
    mockDecodeResult = makeMockAudioBuffer({
      numberOfChannels: 1,
      length: longLength,
      sampleRate,
      channelData: [pcm],
    });
    offlineRenderResult = makeMockAudioBuffer({
      numberOfChannels: 1,
      length: 22050 * 120,
      sampleRate: 22050,
      channelData: [new Float32Array(22050 * 120)],
    });

    const file = new File([new ArrayBuffer(10)], "long.wav", { type: "audio/wav" });
    const result = await decodeAudioFile(file);

    expect(result.storedAudio.length).toBe(maxNativeLength);
    expect(result.analysisAudio.length).toBe(22050 * 120);
  });

  it("closes AudioContext even when decode fails", async () => {
    const closeFn = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "AudioContext",
      function MockAudioContextFail(this: Record<string, unknown>) {
        this.decodeAudioData = vi.fn().mockRejectedValue(new Error("Bad format"));
        this.close = closeFn;
      },
    );

    const file = new File([new ArrayBuffer(10)], "corrupt.bin", { type: "audio/wav" });

    await expect(decodeAudioFile(file)).rejects.toThrow("Bad format");
    expect(closeFn).toHaveBeenCalled();
  });
});
