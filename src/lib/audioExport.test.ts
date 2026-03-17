import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { encodeWav, exportToMidi, downloadBlob, exportToMp3, exportToWav } from "./audioExport";
import type { MappedNote } from "./noteMapper";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readString(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

function makeSamples(length: number, value: number = 0): Float32Array {
  const arr = new Float32Array(length);
  arr.fill(value);
  return arr;
}

function makeNote(overrides: Partial<MappedNote> = {}): MappedNote {
  return {
    midi: 60,
    name: "C4",
    pitchClass: "C",
    octave: 4,
    startTimeS: 0,
    durationS: 0.5,
    amplitude: 0.5,
    ...overrides,
  };
}

async function blobToDataView(blob: Blob): Promise<DataView> {
  const buf = await blob.arrayBuffer();
  return new DataView(buf);
}

function readInt24(view: DataView, offset: number): number {
  const byte0 = view.getUint8(offset);
  const byte1 = view.getUint8(offset + 1);
  const byte2 = view.getUint8(offset + 2);
  const value = byte0 | (byte1 << 8) | (byte2 << 16);
  return (value & 0x800000) !== 0 ? value | ~0xffffff : value;
}

// ---------------------------------------------------------------------------
// encodeWav
// ---------------------------------------------------------------------------

describe("encodeWav", () => {
  it("returns a Blob with audio/wav MIME type", () => {
    const blob = encodeWav(makeSamples(10));
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("audio/wav");
  });

  it("has correct file size (44 byte header + 2 bytes per sample)", () => {
    const sampleCount = 100;
    const blob = encodeWav(makeSamples(sampleCount));
    expect(blob.size).toBe(44 + sampleCount * 2);
  });

  it("writes a valid RIFF/WAVE header", async () => {
    const samples = makeSamples(10);
    const view = await blobToDataView(encodeWav(samples));

    expect(readString(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
    expect(readString(view, 8, 4)).toBe("WAVE");
  });

  it("writes correct fmt chunk fields", async () => {
    const sampleRate = 44100;
    const view = await blobToDataView(encodeWav(makeSamples(10), sampleRate));

    expect(readString(view, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16); // chunk size
    expect(view.getUint16(20, true)).toBe(1);  // PCM format
    expect(view.getUint16(22, true)).toBe(1);  // mono
    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(view.getUint32(28, true)).toBe(sampleRate * 2); // byteRate
    expect(view.getUint16(32, true)).toBe(2);  // blockAlign
    expect(view.getUint16(34, true)).toBe(16); // bitsPerSample
  });

  it("writes correct data chunk header", async () => {
    const samples = makeSamples(20);
    const view = await blobToDataView(encodeWav(samples));

    expect(readString(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
  });

  it("clamps sample values to [-1, 1]", async () => {
    const samples = new Float32Array([2.0, -2.0]);
    const view = await blobToDataView(encodeWav(samples));

    // Max positive: 0x7FFF, Max negative: -0x8000
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });

  it("encodes silence as zeros", async () => {
    const view = await blobToDataView(encodeWav(makeSamples(4, 0)));

    for (let i = 0; i < 4; i++) {
      expect(view.getInt16(44 + i * 2, true)).toBe(0);
    }
  });

  it("uses default sample rate of 22050", async () => {
    const view = await blobToDataView(encodeWav(makeSamples(1)));
    expect(view.getUint32(24, true)).toBe(22050);
  });

  it("supports 24-bit PCM encoding", async () => {
    const samples = new Float32Array([1, -1]);
    const view = await blobToDataView(encodeWav(samples, { bitDepth: 24, sampleRate: 44100 }));

    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 3);
    expect(view.getUint16(32, true)).toBe(3);
    expect(view.getUint16(34, true)).toBe(24);
    expect(view.getUint32(40, true)).toBe(samples.length * 3);
    expect(readInt24(view, 44)).toBe(0x7fffff);
    expect(readInt24(view, 47)).toBe(-0x800000);
  });
});

describe("exportToWav", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps existing defaults when no options are provided", async () => {
    const view = await blobToDataView(await exportToWav(makeSamples(4, 0.25)));

    expect(view.getUint32(24, true)).toBe(22050);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getInt16(44, true)).toBe(0x1fff);
  });

  it("peak-normalizes exported samples when requested", async () => {
    const view = await blobToDataView(
      await exportToWav(new Float32Array([0.25, -0.5]), { normalizePeak: true }),
    );

    expect(view.getInt16(44, true)).toBeGreaterThan(16000);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });

  it("resamples to 44.1 kHz when requested", async () => {
    const renderedSamples = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const mockStart = vi.fn();
    const mockConnect = vi.fn();

    vi.stubGlobal(
      "OfflineAudioContext",
      function MockOfflineAudioContext(this: Record<string, unknown>) {
        this.createBuffer = vi.fn().mockImplementation((_channels: number, length: number, sampleRate: number) => {
          const channelData = new Float32Array(length);
          return {
            getChannelData: () => channelData,
            length,
            sampleRate,
          } as unknown as AudioBuffer;
        });
        this.createBufferSource = vi.fn().mockReturnValue({
          buffer: null,
          connect: mockConnect,
          start: mockStart,
        });
        this.destination = {};
        this.startRendering = vi.fn().mockResolvedValue({
          getChannelData: () => renderedSamples,
        } as unknown as AudioBuffer);
      },
    );

    const view = await blobToDataView(await exportToWav(makeSamples(2, 0.25), { sampleRate: 44100 }));

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(40, true)).toBe(renderedSamples.length * 2);
  });

  it("uses the provided input sample rate when resampling exports", async () => {
    const mockStart = vi.fn();
    const mockConnect = vi.fn();

    vi.stubGlobal(
      "OfflineAudioContext",
      function MockOfflineAudioContext(
        this: Record<string, unknown>,
        _channels: number,
        length: number,
        sampleRate: number,
      ) {
        this.createBuffer = vi.fn().mockImplementation(
          (_bufferChannels: number, bufferLength: number, bufferSampleRate: number) => {
            const channelData = new Float32Array(bufferLength);
            return {
              getChannelData: () => channelData,
              length: bufferLength,
              sampleRate: bufferSampleRate,
            } as unknown as AudioBuffer;
          },
        );
        this.createBufferSource = vi.fn().mockReturnValue({
          buffer: null,
          connect: mockConnect,
          start: mockStart,
        });
        this.destination = {};
        this.startRendering = vi.fn().mockResolvedValue({
          getChannelData: () => new Float32Array(length),
        } as unknown as AudioBuffer);
        expect(sampleRate).toBe(44100);
      },
    );

    await exportToWav(makeSamples(48000, 0.25), {
      inputSampleRate: 48000,
      sampleRate: 44100,
    });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// exportToMidi
// ---------------------------------------------------------------------------

describe("exportToMidi", () => {
  it("returns a Blob with audio/midi MIME type", () => {
    const blob = exportToMidi([makeNote()]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("audio/midi");
  });

  it("writes MThd header with format 0, 1 track, 480 tpqn", async () => {
    const view = await blobToDataView(exportToMidi([makeNote()]));

    expect(readString(view, 0, 4)).toBe("MThd");
    expect(view.getUint32(4, false)).toBe(6);   // header data length
    expect(view.getUint16(8, false)).toBe(0);    // format 0
    expect(view.getUint16(10, false)).toBe(1);   // 1 track
    expect(view.getUint16(12, false)).toBe(480); // ticks per quarter note
  });

  it("writes an MTrk chunk", async () => {
    const view = await blobToDataView(exportToMidi([makeNote()]));
    expect(readString(view, 14, 4)).toBe("MTrk");
    // Track length is stored at offset 18 (4 bytes big-endian)
    const trackLen = view.getUint32(18, false);
    expect(trackLen).toBeGreaterThan(0);
    // Total file size = 14 (MThd) + 8 (MTrk header) + trackLen
    expect(view.byteLength).toBe(14 + 8 + trackLen);
  });

  it("includes a tempo meta event at the start of the track", async () => {
    const bpm = 120;
    const view = await blobToDataView(exportToMidi([makeNote()], bpm));

    // Track data starts at offset 22
    // First event: delta=0, FF 51 03 <3 bytes tempo>
    expect(view.getUint8(22)).toBe(0x00); // delta
    expect(view.getUint8(23)).toBe(0xff); // meta
    expect(view.getUint8(24)).toBe(0x51); // tempo type
    expect(view.getUint8(25)).toBe(0x03); // data length

    const microsPerBeat = Math.round(60_000_000 / bpm);
    const b1 = view.getUint8(26);
    const b2 = view.getUint8(27);
    const b3 = view.getUint8(28);
    expect((b1 << 16) | (b2 << 8) | b3).toBe(microsPerBeat);
  });

  it("emits an acoustic guitar program change before note events", async () => {
    const view = await blobToDataView(exportToMidi([makeNote()]));

    expect(view.getUint8(29)).toBe(0x00);
    expect(view.getUint8(30)).toBe(0xc0);
    expect(view.getUint8(31)).toBe(25);
  });

  it("ends with an End of Track meta event (FF 2F 00)", async () => {
    const buf = await exportToMidi([makeNote()]).arrayBuffer();
    const bytes = new Uint8Array(buf);
    const last3 = bytes.slice(-3);
    expect(last3[0]).toBe(0xff);
    expect(last3[1]).toBe(0x2f);
    expect(last3[2]).toBe(0x00);
  });

  it("handles empty note array gracefully", async () => {
    const blob = exportToMidi([]);
    expect(blob.size).toBeGreaterThan(14); // at least header + track shell

    const view = await blobToDataView(blob);
    expect(readString(view, 0, 4)).toBe("MThd");
    expect(readString(view, 14, 4)).toBe("MTrk");
  });

  it("creates Note On (0x90) and Note Off (0x80) events", async () => {
    const note = makeNote({ midi: 64, startTimeS: 0, durationS: 0.5, amplitude: 0.5 });
    const buf = await exportToMidi([note]).arrayBuffer();
    const bytes = new Uint8Array(buf);

    // Look for Note On (0x90) and Note Off (0x80) with pitch 64
    let hasNoteOn = false;
    let hasNoteOff = false;
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x90 && bytes[i + 1] === 64) hasNoteOn = true;
      if (bytes[i] === 0x80 && bytes[i + 1] === 64) hasNoteOff = true;
    }
    expect(hasNoteOn).toBe(true);
    expect(hasNoteOff).toBe(true);
  });

  it("clamps velocity to [1, 127]", async () => {
    // Very high amplitude → should be clamped to 127
    const loudNote = makeNote({ amplitude: 10 });
    const buf = await exportToMidi([loudNote]).arrayBuffer();
    const bytes = new Uint8Array(buf);

    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x90 && bytes[i + 1] === loudNote.midi) {
        expect(bytes[i + 2]).toBeLessThanOrEqual(127);
        expect(bytes[i + 2]).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("clamps MIDI pitch to [0, 127]", async () => {
    const highNote = makeNote({ midi: 200 });
    const buf = await exportToMidi([highNote]).arrayBuffer();
    const bytes = new Uint8Array(buf);

    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x90) {
        expect(bytes[i + 1]).toBeLessThanOrEqual(127);
      }
    }
  });

  it("respects custom BPM for tempo event", async () => {
    const bpm = 90;
    const view = await blobToDataView(exportToMidi([makeNote()], bpm));

    const microsPerBeat = Math.round(60_000_000 / bpm);
    const b1 = view.getUint8(26);
    const b2 = view.getUint8(27);
    const b3 = view.getUint8(28);
    expect((b1 << 16) | (b2 << 8) | b3).toBe(microsPerBeat);
  });

  it("sorts note-off before note-on at the same tick", async () => {
    // Two notes back-to-back: first ends at tick 480, second starts at tick 480
    const notes = [
      makeNote({ midi: 60, startTimeS: 0, durationS: 0.5 }),
      makeNote({ midi: 64, startTimeS: 0.5, durationS: 0.5 }),
    ];
    const buf = await exportToMidi(notes, 120).arrayBuffer();
    const bytes = new Uint8Array(buf);

    // Find the transition point where note 60 off and note 64 on occur
    // Note off for 60 (0x80, 60, 0) should come before note on for 64 (0x90, 64, vel)
    let offIndex = -1;
    let onIndex = -1;
    for (let i = 22; i < bytes.length - 2; i++) {
      if (bytes[i] === 0x80 && bytes[i + 1] === 60) offIndex = i;
      if (bytes[i] === 0x90 && bytes[i + 1] === 64) onIndex = i;
    }
    expect(offIndex).toBeGreaterThan(-1);
    expect(onIndex).toBeGreaterThan(-1);
    expect(offIndex).toBeLessThan(onIndex);
  });
});

// ---------------------------------------------------------------------------
// downloadBlob
// ---------------------------------------------------------------------------

describe("downloadBlob", () => {
  let appended: HTMLElement[];
  let removed: HTMLElement[];

  beforeEach(() => {
    appended = [];
    removed = [];
    vi.useFakeTimers();

    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      appended.push(node as HTMLElement);
      return node;
    });
    vi.spyOn(document.body, "removeChild").mockImplementation((node) => {
      removed.push(node as HTMLElement);
      return node;
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("creates an anchor element and triggers a click", () => {
    const blob = new Blob(["test"], { type: "text/plain" });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click");

    downloadBlob(blob, "test.txt");

    expect(appended).toHaveLength(1);
    const anchor = appended[0] as HTMLAnchorElement;
    expect(anchor.tagName).toBe("A");
    expect(anchor.href).toContain("blob:mock-url");
    expect(anchor.download).toBe("test.txt");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("cleans up after timeout", () => {
    const blob = new Blob(["test"]);
    downloadBlob(blob, "file.wav");

    expect(removed).toHaveLength(0);
    vi.advanceTimersByTime(200);
    expect(removed).toHaveLength(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

// ---------------------------------------------------------------------------
// exportToMp3
// ---------------------------------------------------------------------------

describe("exportToMp3", () => {
  const workers: {
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
  }[] = [];

  beforeEach(() => {
    workers.length = 0;

    class MockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();

      constructor() {
        workers.push(this);
      }
    }

    vi.stubGlobal("Worker", MockWorker as unknown as typeof Worker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts PCM audio to the encoder worker and resolves with the encoded blob", async () => {
    const pcmAudio = new Float32Array([0.1, -0.2]);
    const promise = exportToMp3(pcmAudio, 44100);
    const worker = workers[0];
    const encodedBlob = new Blob(["mp3"], { type: "audio/mp3" });

    expect(worker?.postMessage).toHaveBeenCalledWith({
      pcmAudio,
      sampleRate: 44100,
    });

    worker?.onmessage?.({
      data: { blob: encodedBlob },
    } as MessageEvent);

    await expect(promise).resolves.toBe(encodedBlob);
    expect(worker?.terminate).toHaveBeenCalledTimes(1);
  });

  it("rejects and terminates the worker when encoding fails", async () => {
    const promise = exportToMp3(new Float32Array([0.1]));
    const worker = workers[0];
    const errorEvent = new ErrorEvent("error", { message: "worker failed" });

    worker?.onerror?.(errorEvent);

    await expect(promise).rejects.toBe(errorEvent);
    expect(worker?.terminate).toHaveBeenCalledTimes(1);
  });
});
