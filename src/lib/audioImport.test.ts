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

    // At target sample rate, no resampling — should get the same data back
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(5);
    expect(result[0]).toBeCloseTo(0.1);
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

    expect(result.length).toBe(3);
    expect(result[0]).toBeCloseTo(0.5); // (1.0 + 0.0) / 2
    expect(result[1]).toBeCloseTo(0.5); // (0.0 + 1.0) / 2
    expect(result[2]).toBeCloseTo(0.5); // (0.5 + 0.5) / 2
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

    // Should have gone through resampling and returned the resampled data
    expect(result.length).toBe(22050);
  });

  it("trims audio longer than 120 seconds", async () => {
    const sampleRate = 22050;
    const longLength = sampleRate * 150; // 150 seconds
    const maxLength = sampleRate * 120; // 120 second cap
    const pcm = new Float32Array(longLength);
    mockDecodeResult = makeMockAudioBuffer({
      numberOfChannels: 1,
      length: longLength,
      sampleRate,
      channelData: [pcm],
    });

    const file = new File([new ArrayBuffer(10)], "long.wav", { type: "audio/wav" });
    const result = await decodeAudioFile(file);

    // Should be capped to 120 seconds worth at 22050 Hz
    expect(result.length).toBe(maxLength);
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
