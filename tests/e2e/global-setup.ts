import fs from "node:fs";
import path from "node:path";

const SAMPLE_RATE = 44100;

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function writeWavMono16(filePath: string, samples: Float32Array, sampleRate: number): void {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    const pcm = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, pcm, true);
    offset += 2;
  }

  fs.writeFileSync(filePath, Buffer.from(buffer));
}

function synthKnownClip(): Float32Array {
  const events = [
    { midi: 60, durationS: 0.85 }, // C4
    { midi: 64, durationS: 0.85 }, // E4
    { midi: 67, durationS: 0.85 }, // G4
  ];

  const leadInS = 0.2;
  const gapS = 0.15;
  const tailS = 0.35;

  const totalSeconds =
    leadInS +
    events.reduce((sum, e) => sum + e.durationS, 0) +
    gapS * (events.length - 1) +
    tailS;

  const totalSamples = Math.floor(totalSeconds * SAMPLE_RATE);
  const output = new Float32Array(totalSamples);

  let cursor = Math.floor(leadInS * SAMPLE_RATE);

  for (const event of events) {
    const frequency = midiToFrequency(event.midi);
    const durationSamples = Math.floor(event.durationS * SAMPLE_RATE);

    for (let i = 0; i < durationSamples; i++) {
      const t = i / SAMPLE_RATE;
      const attack = Math.min(1, i / (SAMPLE_RATE * 0.02));
      const release = Math.min(1, (durationSamples - i) / (SAMPLE_RATE * 0.06));
      const env = Math.min(attack, release);

      // Add harmonics so the input looks instrument-like, not a pure test tone.
      const fundamental = Math.sin(2 * Math.PI * frequency * t);
      const harmonic2 = 0.35 * Math.sin(2 * Math.PI * frequency * 2 * t);
      const harmonic3 = 0.2 * Math.sin(2 * Math.PI * frequency * 3 * t);
      output[cursor + i] += (fundamental + harmonic2 + harmonic3) * 0.18 * env;
    }

    cursor += durationSamples + Math.floor(gapS * SAMPLE_RATE);
  }

  return output;
}

export default async function globalSetup(): Promise<void> {
  const fixtureDir = path.resolve(process.cwd(), "tests", "fixtures");
  const fixtureFile = path.resolve(fixtureDir, "known-c-major.wav");

  fs.mkdirSync(fixtureDir, { recursive: true });
  const samples = synthKnownClip();
  writeWavMono16(fixtureFile, samples, SAMPLE_RATE);
}
