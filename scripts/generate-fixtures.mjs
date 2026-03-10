/**
 * Generate test audio fixtures for instrument profile testing.
 *
 * Creates WAV files with known chord tones at instrument-appropriate
 * MIDI ranges and quality levels so we can verify the full detection
 * pipeline (basic-pitch → filter → chord detect) per profile.
 *
 * Usage: node scripts/generate-fixtures.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SAMPLE_RATE = 22050;
const DURATION_S = 3;
const SAMPLES = SAMPLE_RATE * DURATION_S;
const FIXTURES_DIR = join(process.cwd(), "tests", "fixtures");

mkdirSync(FIXTURES_DIR, { recursive: true });

/** MIDI note number → frequency in Hz */
function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Generate a sine tone with simple ADSR envelope */
function sineTone(freq, amplitude, startSample, durationSamples, buf) {
  const attack = Math.min(0.01 * SAMPLE_RATE, durationSamples * 0.1);
  const release = Math.min(0.05 * SAMPLE_RATE, durationSamples * 0.2);
  const end = startSample + durationSamples;

  for (let i = startSample; i < end && i < buf.length; i++) {
    const local = i - startSample;
    let env = 1;
    if (local < attack) env = local / attack;
    else if (local > durationSamples - release) env = (durationSamples - local) / release;

    buf[i] += amplitude * env * Math.sin(2 * Math.PI * freq * (i / SAMPLE_RATE));
  }
}

/**
 * Add harmonics to simulate a plucked string (guitar-like timbre).
 * Harmonics decay faster than the fundamental.
 */
function pluckedTone(freq, amplitude, startSample, durationSamples, buf) {
  const harmonics = [1, 0.5, 0.33, 0.25, 0.12, 0.08];
  for (let h = 0; h < harmonics.length; h++) {
    const hFreq = freq * (h + 1);
    if (hFreq > SAMPLE_RATE / 2) break; // Nyquist
    const hDur = Math.max(Math.floor(durationSamples / (1 + h * 0.5)), 1);
    sineTone(hFreq, amplitude * harmonics[h], startSample, hDur, buf);
  }
}

/** Add low-level white noise across the buffer */
function addNoise(buf, amplitude) {
  for (let i = 0; i < buf.length; i++) {
    buf[i] += (Math.random() * 2 - 1) * amplitude;
  }
}

/** Encode a Float32 mono buffer as a 16-bit WAV file (returns Buffer) */
function encodeWav(float32Buf) {
  const numSamples = float32Buf.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);          // chunk size
  buffer.writeUInt16LE(1, 20);           // PCM
  buffer.writeUInt16LE(1, 22);           // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24); // sample rate
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(16, 34);          // bits per sample

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, float32Buf[i]));
    const int16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, 44 + i * 2);
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// Fixture definitions
// ---------------------------------------------------------------------------

const fixtures = [
  {
    name: "guitar-c-major-clean",
    description: "Clean guitar C major chord – C3 E3 G3 (MIDI 48 52 55)",
    generate() {
      const buf = new Float32Array(SAMPLES);
      const notes = [48, 52, 55]; // C3, E3, G3
      const startSample = Math.floor(0.2 * SAMPLE_RATE);
      const durSamples = Math.floor(2.0 * SAMPLE_RATE);
      for (const midi of notes) {
        pluckedTone(midiToFreq(midi), 0.3, startSample, durSamples, buf);
      }
      return buf;
    },
  },
  {
    name: "guitar-am-clean",
    description: "Clean guitar A minor chord – A2 E3 A3 C4 E4 (MIDI 45 52 57 60 64)",
    generate() {
      const buf = new Float32Array(SAMPLES);
      const notes = [45, 52, 57, 60, 64]; // A2, E3, A3, C4, E4
      const startSample = Math.floor(0.2 * SAMPLE_RATE);
      const durSamples = Math.floor(2.0 * SAMPLE_RATE);
      for (const midi of notes) {
        pluckedTone(midiToFreq(midi), 0.28, startSample, durSamples, buf);
      }
      return buf;
    },
  },
  {
    name: "guitar-c-major-noisy",
    description: "Noisy guitar C major – real chord + ghost notes, pick noise, sub-bass artifact",
    generate() {
      const buf = new Float32Array(SAMPLES);
      // Main chord tones
      const mainNotes = [48, 52, 55]; // C3, E3, G3
      const startSample = Math.floor(0.2 * SAMPLE_RATE);
      const durSamples = Math.floor(2.0 * SAMPLE_RATE);
      for (const midi of mainNotes) {
        pluckedTone(midiToFreq(midi), 0.3, startSample, durSamples, buf);
      }
      // Ghost note: very quiet open string
      pluckedTone(midiToFreq(64), 0.04, startSample, durSamples, buf); // E4 ghost
      // Pick noise: very short transient
      sineTone(midiToFreq(80), 0.2, startSample, Math.floor(0.02 * SAMPLE_RATE), buf);
      // Sub-bass artifact below guitar range
      sineTone(midiToFreq(28), 0.15, startSample, durSamples, buf); // E1 (MIDI 28)
      // Background noise
      addNoise(buf, 0.02);
      return buf;
    },
  },
  {
    name: "piano-c-major-clean",
    description: "Clean piano C major chord – C4 E4 G4 (MIDI 60 64 67)",
    generate() {
      const buf = new Float32Array(SAMPLES);
      const notes = [60, 64, 67]; // C4, E4, G4
      const startSample = Math.floor(0.2 * SAMPLE_RATE);
      const durSamples = Math.floor(2.2 * SAMPLE_RATE);
      for (const midi of notes) {
        // Piano has stronger higher harmonics than guitar
        const freq = midiToFreq(midi);
        sineTone(freq, 0.28, startSample, durSamples, buf);
        sineTone(freq * 2, 0.14, startSample, Math.floor(durSamples * 0.7), buf);
        sineTone(freq * 3, 0.07, startSample, Math.floor(durSamples * 0.4), buf);
      }
      return buf;
    },
  },
  {
    name: "piano-two-chords",
    description: "Piano plays C major then A minor sequentially – tests windowed detection",
    generate() {
      const buf = new Float32Array(SAMPLE_RATE * 5); // 5 seconds
      // Chord 1: C major at t=0.2s
      const c1Start = Math.floor(0.2 * SAMPLE_RATE);
      const c1Dur = Math.floor(1.5 * SAMPLE_RATE);
      for (const midi of [60, 64, 67]) {
        sineTone(midiToFreq(midi), 0.28, c1Start, c1Dur, buf);
      }
      // Chord 2: A minor at t=3.0s
      const c2Start = Math.floor(3.0 * SAMPLE_RATE);
      const c2Dur = Math.floor(1.5 * SAMPLE_RATE);
      for (const midi of [57, 60, 64]) { // A3, C4, E4
        sineTone(midiToFreq(midi), 0.28, c2Start, c2Dur, buf);
      }
      return buf;
    },
  },
  {
    name: "guitar-low-quality",
    description: "Low quality guitar recording – heavy noise, quiet signal",
    generate() {
      const buf = new Float32Array(SAMPLES);
      const notes = [48, 52, 55]; // C3, E3, G3
      const startSample = Math.floor(0.3 * SAMPLE_RATE);
      const durSamples = Math.floor(1.8 * SAMPLE_RATE);
      for (const midi of notes) {
        pluckedTone(midiToFreq(midi), 0.12, startSample, durSamples, buf); // quieter signal
      }
      addNoise(buf, 0.06); // heavier noise floor
      return buf;
    },
  },
];

// ---------------------------------------------------------------------------
// Write fixtures
// ---------------------------------------------------------------------------

console.log(`Generating ${fixtures.length} audio fixtures in ${FIXTURES_DIR}...\n`);

for (const f of fixtures) {
  const buf = f.generate();
  const wav = encodeWav(buf);
  const outPath = join(FIXTURES_DIR, `${f.name}.wav`);
  writeFileSync(outPath, wav);
  console.log(`  ✓ ${f.name}.wav  (${(wav.length / 1024).toFixed(1)} KB) — ${f.description}`);
}

console.log("\nDone.");
