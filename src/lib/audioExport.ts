import type { MappedNote } from "./noteMapper";

const DEFAULT_SAMPLE_RATE = 22050;
const DEFAULT_WAV_BIT_DEPTH = 16;

export type WavBitDepth = 16 | 24;
export type WavSampleRate = 22050 | 44100;

export interface EncodeWavOptions {
  sampleRate?: number;
  bitDepth?: WavBitDepth;
}

export interface WavExportOptions {
  bitDepth?: WavBitDepth;
  normalizePeak?: boolean;
  sampleRate?: WavSampleRate;
  inputSampleRate?: number;
}

export const DEFAULT_WAV_EXPORT_OPTIONS = {
  bitDepth: DEFAULT_WAV_BIT_DEPTH,
  inputSampleRate: DEFAULT_SAMPLE_RATE,
  normalizePeak: false,
  sampleRate: DEFAULT_SAMPLE_RATE,
} as const satisfies Required<WavExportOptions>;

/** Encode a Float32Array (mono) into a WAV Blob. */
export function encodeWav(
  samples: Float32Array,
  sampleRateOrOptions: number | EncodeWavOptions = DEFAULT_SAMPLE_RATE,
): Blob {
  const { bitDepth, sampleRate } = resolveEncodeWavOptions(sampleRateOrOptions);
  const numChannels = 1;
  const bytesPerSample = bitDepth / 8;
  const bitsPerSample = bitDepth;
  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  writePcmSamples(view, samples, 44, bitDepth);

  return new Blob([buffer], { type: "audio/wav" });
}

export async function exportToWav(
  samples: Float32Array,
  options: WavExportOptions = {},
): Promise<Blob> {
  const resolvedOptions = resolveWavExportOptions(options);
  const resampledSamples = resolvedOptions.sampleRate === resolvedOptions.inputSampleRate
    ? samples
    : await resamplePcm(samples, resolvedOptions.inputSampleRate, resolvedOptions.sampleRate);
  const outputSamples = resolvedOptions.normalizePeak
    ? normalizeSamplesToPeak(resampledSamples)
    : resampledSamples;

  return encodeWav(outputSamples, {
    bitDepth: resolvedOptions.bitDepth,
    sampleRate: resolvedOptions.sampleRate,
  });
}

function resolveEncodeWavOptions(
  sampleRateOrOptions: number | EncodeWavOptions,
): Required<EncodeWavOptions> {
  if (typeof sampleRateOrOptions === "number") {
    return {
      bitDepth: DEFAULT_WAV_BIT_DEPTH,
      sampleRate: sampleRateOrOptions,
    };
  }

  return {
    bitDepth: sampleRateOrOptions.bitDepth ?? DEFAULT_WAV_BIT_DEPTH,
    sampleRate: sampleRateOrOptions.sampleRate ?? DEFAULT_SAMPLE_RATE,
  };
}

function resolveWavExportOptions(options: WavExportOptions): Required<WavExportOptions> {
  return {
    bitDepth: options.bitDepth ?? DEFAULT_WAV_EXPORT_OPTIONS.bitDepth,
    inputSampleRate: options.inputSampleRate ?? DEFAULT_WAV_EXPORT_OPTIONS.inputSampleRate,
    normalizePeak: options.normalizePeak ?? DEFAULT_WAV_EXPORT_OPTIONS.normalizePeak,
    sampleRate: options.sampleRate ?? DEFAULT_WAV_EXPORT_OPTIONS.sampleRate,
  };
}

function writePcmSamples(
  view: DataView,
  samples: Float32Array,
  startOffset: number,
  bitDepth: WavBitDepth,
): void {
  let offset = startOffset;

  if (bitDepth === 24) {
    for (let i = 0; i < samples.length; i++, offset += 3) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      const intSample = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
      view.setUint8(offset, intSample & 0xff);
      view.setUint8(offset + 1, (intSample >> 8) & 0xff);
      view.setUint8(offset + 2, (intSample >> 16) & 0xff);
    }
    return;
  }

  for (let i = 0; i < samples.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
}

function normalizeSamplesToPeak(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const magnitude = Math.abs(samples[i]);
    if (magnitude > peak) {
      peak = magnitude;
    }
  }

  if (peak === 0) {
    return samples.slice();
  }

  const gain = 1 / peak;
  const normalized = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] * gain;
  }

  return normalized;
}

async function resamplePcm(
  samples: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number,
): Promise<Float32Array> {
  const frameCount = Math.ceil((samples.length * targetSampleRate) / inputSampleRate);
  const offlineContext = new OfflineAudioContext(1, frameCount, targetSampleRate);
  const buffer = offlineContext.createBuffer(1, samples.length, inputSampleRate);
  buffer.getChannelData(0).set(samples);

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineContext.destination);
  source.start();

  const rendered = await offlineContext.startRendering();
  return rendered.getChannelData(0).slice();
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ---------------------------------------------------------------------------
// MIDI File Export — Standard MIDI Format Type 0 (single track)
// ---------------------------------------------------------------------------

interface MidiEvent {
  tick: number;
  bytes: number[];
}

const DEFAULT_MIDI_CHANNEL = 0;
const ACOUSTIC_GUITAR_STEEL_PROGRAM = 25;

/** Write a MIDI variable-length quantity. */
function writeVLQ(value: number): number[] {
  if (value < 0) value = 0;
  if (value < 0x80) return [value];
  const bytes: number[] = [];
  bytes.push(value & 0x7f);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes.reverse();
}

/**
 * Export detected notes to a Standard MIDI File (Type 0, single track).
 * Returns a `.mid` Blob ready for download.
 */
export function exportToMidi(notes: MappedNote[], bpm: number = 120): Blob {
  const ticksPerBeat = 480;
  const ticksPerSec = (ticksPerBeat * bpm) / 60;
  const channel = DEFAULT_MIDI_CHANNEL;

  // Build absolute-tick events
  const events: MidiEvent[] = [];

  for (const note of notes) {
    const startTick = Math.round(note.startTimeS * ticksPerSec);
    const endTick = Math.round((note.startTimeS + note.durationS) * ticksPerSec);
    const velocity = Math.max(1, Math.min(127, Math.round(note.amplitude * 127 * 3)));
    const pitch = Math.max(0, Math.min(127, note.midi));

    // Note On
    events.push({
      tick: startTick,
      bytes: [0x90 | channel, pitch, velocity],
    });
    // Note Off
    events.push({
      tick: endTick,
      bytes: [0x80 | channel, pitch, 0],
    });
  }

  // Sort by tick — note-offs before note-ons at same tick
  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    const aIsOff = (a.bytes[0] & 0xf0) === 0x80 ? 0 : 1;
    const bIsOff = (b.bytes[0] & 0xf0) === 0x80 ? 0 : 1;
    return aIsOff - bIsOff;
  });

  // Build the MTrk chunk bytes
  const trackBytes: number[] = [];

  // Tempo meta event: FF 51 03 <microsPerBeat (3 bytes BE)>
  const microsPerBeat = Math.round(60_000_000 / bpm);
  trackBytes.push(0x00); // delta-time = 0
  trackBytes.push(0xff, 0x51, 0x03);
  trackBytes.push((microsPerBeat >> 16) & 0xff);
  trackBytes.push((microsPerBeat >> 8) & 0xff);
  trackBytes.push(microsPerBeat & 0xff);

  // Default exported instrument to acoustic steel guitar.
  trackBytes.push(0x00); // delta-time = 0
  trackBytes.push(0xc0 | channel, ACOUSTIC_GUITAR_STEEL_PROGRAM);

  // Note events with delta-time encoding
  let prevTick = 0;
  for (const evt of events) {
    const delta = evt.tick - prevTick;
    trackBytes.push(...writeVLQ(delta));
    trackBytes.push(...evt.bytes);
    prevTick = evt.tick;
  }

  // End of track: FF 2F 00
  trackBytes.push(0x00); // delta-time = 0
  trackBytes.push(0xff, 0x2f, 0x00);

  // Assemble the full file
  const headerSize = 14; // MThd (4) + length (4) + format (2) + tracks (2) + division (2)
  const trackChunkSize = 8 + trackBytes.length; // MTrk (4) + length (4) + data
  const fileSize = headerSize + trackChunkSize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  let pos = 0;

  // MThd
  writeString(view, pos, "MThd"); pos += 4;
  view.setUint32(pos, 6, false); pos += 4; // header data length
  view.setUint16(pos, 0, false); pos += 2; // format 0
  view.setUint16(pos, 1, false); pos += 2; // 1 track
  view.setUint16(pos, ticksPerBeat, false); pos += 2; // ticks per quarter note

  // MTrk
  writeString(view, pos, "MTrk"); pos += 4;
  view.setUint32(pos, trackBytes.length, false); pos += 4;
  for (const b of trackBytes) {
    view.setUint8(pos++, b);
  }

  return new Blob([buf], { type: "audio/midi" });
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

/** Trigger a browser file download for the given Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Clean up asynchronously so the browser can start the download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ---------------------------------------------------------------------------
// MP3 Export via LameJS Web Worker
// ---------------------------------------------------------------------------

/**
 * Export Float32Array to MP3 using a Web Worker so we don't block the UI.
 */
export function exportToMp3(
  pcmAudio: Float32Array,
  sampleRate: number = DEFAULT_SAMPLE_RATE
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/mp3Encoder.worker", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data.blob as Blob);
      }
    };

    worker.onerror = (e) => {
      worker.terminate();
      reject(e);
    };

    worker.postMessage({ pcmAudio, sampleRate });
  });
}

