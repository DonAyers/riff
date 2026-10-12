// Tiny plucked-string synth for chord previews: Karplus-Strong with the
// Jaffe-Smith extensions (allpass fine tuning, pitch-aware decay, pick
// position and dynamics filtering) plus a few guitar-body resonances.
// It renders straight into a Float32Array, so the browser plays it with one
// AudioBufferSourceNode and tests/scripts can render the same audio offline.
// research/spike-strum-sound.md explains the choices.

/** MIDI note of each open string, low E to high E (standard tuning). */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64] as const;

export type StrumDirection = "down" | "up";

export interface PluckOptions {
  /** 0..1: how hard the string is picked (louder and brighter). */
  velocity?: number;
  /** Seconds for the fundamental to fall 60 dB. Higher notes ring shorter. */
  decayS?: number;
  /** 0..0.5: where along the string it is picked (0.5 = middle). */
  pickPosition?: number;
  /** Seconds before the string is damped; omit to let it ring out. */
  holdS?: number;
  /** Seed for the excitation noise, so renders are repeatable. */
  seed?: number;
}

export interface StrumOptions {
  direction?: StrumDirection;
  /** Gap between neighbouring strings, in seconds. */
  strumSpreadS?: number;
  velocity?: number;
  /** Total length of the rendered buffer, in seconds. */
  durationS?: number;
  seed?: number;
}

const DEFAULT_SPREAD_S = 0.014;
const DEFAULT_STRUM_S = 2.6;
// Approximate low air/top-plate modes of a dreadnought body: [Hz, Q, gain].
const BODY_MODES: ReadonlyArray<readonly [number, number, number]> = [
  [98, 6, 0.5],
  [204, 5, 0.35],
  [390, 4, 0.18],
];

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Frets low E → high E (-1 = muted) to sounding MIDI notes (null = muted). */
export function voicingToMidi(
  frets: readonly number[],
  tuning: readonly number[] = STANDARD_TUNING,
): Array<number | null> {
  return tuning.map((open, index) => {
    const fret = frets[index];
    return fret === undefined || fret < 0 ? null : open + fret;
  });
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Adds one plucked note into `out` starting at sample `offset`.
 * Writes nothing past the end of `out`.
 */
export function renderPluck(
  out: Float32Array,
  offset: number,
  midi: number,
  sampleRate: number,
  options: PluckOptions = {},
): void {
  const frequency = midiToFrequency(midi);
  const velocity = Math.min(1, Math.max(0.05, options.velocity ?? 0.8));
  // Low strings sustain longer than high ones on a real guitar.
  const decayS = options.decayS ?? Math.max(0.9, 4.2 - (midi - 40) * 0.09);
  const pickPosition = options.pickPosition ?? 0.18;
  const random = mulberry32(options.seed ?? midi * 7919);

  // Loop delay: integer part + 0.5 sample from the averaging filter + a
  // first-order allpass for the fraction, so high notes stay in tune.
  const period = sampleRate / frequency;
  let integerDelay = Math.floor(period - 0.5);
  let fraction = period - 0.5 - integerDelay;
  if (fraction < 0.1) {
    integerDelay -= 1;
    fraction += 1;
  }
  const allpassC = (1 - fraction) / (1 + fraction);

  // Loss per trip so the fundamental decays 60 dB in decayS, compensating
  // for the averaging filter's own loss at that frequency.
  const averagingGain = Math.cos((Math.PI * frequency) / sampleRate);
  const loss = Math.min(0.99995, 0.001 ** (1 / (frequency * decayS)) / averagingGain);

  // Excitation: one period of noise, low-passed more for soft picks, then a
  // comb notch for the pick position.
  const excitation = new Float32Array(integerDelay);
  const brightness = 0.25 + 0.7 * velocity;
  let smoothed = 0;
  for (let i = 0; i < integerDelay; i++) {
    smoothed += brightness * (random() * 2 - 1 - smoothed);
    excitation[i] = smoothed;
  }
  const notch = Math.max(1, Math.round(pickPosition * integerDelay));
  const shaped = new Float32Array(integerDelay);
  let mean = 0;
  for (let i = 0; i < integerDelay; i++) {
    shaped[i] = excitation[i] - (i >= notch ? excitation[i - notch] : 0);
    mean += shaped[i];
  }
  mean /= integerDelay;
  let peak = 0;
  for (let i = 0; i < integerDelay; i++) {
    shaped[i] -= mean;
    peak = Math.max(peak, Math.abs(shaped[i]));
  }
  const scale = peak > 0 ? velocity / peak : 0;

  const delay = new Float32Array(integerDelay);
  for (let i = 0; i < integerDelay; i++) delay[i] = shaped[i] * scale;

  const holdSamples = options.holdS === undefined ? Infinity : Math.round(options.holdS * sampleRate);
  const dampSamples = Math.round(0.08 * sampleRate);
  const total = out.length - offset;
  let index = 0;
  let previous = 0;
  let allpassIn = 0;
  let allpassOut = 0;
  let dcIn = 0;
  let dcOut = 0;

  for (let n = 0; n < total; n++) {
    const current = delay[index];
    // Two-point average (string losses), then the tuning allpass.
    const averaged = 0.5 * (current + previous);
    previous = current;
    const tuned = allpassC * averaged + allpassIn - allpassC * allpassOut;
    allpassIn = averaged;
    allpassOut = tuned;

    let gain = loss;
    if (n > holdSamples) {
      // A fretting hand lifting off: extra loss over ~80 ms.
      gain *= Math.max(0.9, 1 - (n - holdSamples) / dampSamples * 0.1);
    }
    delay[index] = tuned * gain;
    index = index + 1 === integerDelay ? 0 : index + 1;

    // DC blocker on the way out.
    const sample = current - dcIn + 0.995 * dcOut;
    dcIn = current;
    dcOut = sample;
    out[offset + n] += sample;

    if (n > holdSamples + dampSamples * 3) break;
  }
}

function applyBody(signal: Float32Array, sampleRate: number): Float32Array {
  const output = Float32Array.from(signal);
  for (const [frequency, q, gain] of BODY_MODES) {
    // RBJ band-pass (constant 0 dB peak gain).
    const w0 = (2 * Math.PI * frequency) / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    const b0 = alpha / a0;
    const b2 = -alpha / a0;
    const a1 = (-2 * Math.cos(w0)) / a0;
    const a2 = (1 - alpha) / a0;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let n = 0; n < signal.length; n++) {
      const x = signal[n];
      const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      output[n] += gain * y;
    }
  }
  return output;
}

function normalise(signal: Float32Array, target = 0.8): Float32Array {
  // Fade the last 40 ms so a cut-off tail never clicks.
  const fade = Math.min(signal.length, 1764);
  for (let n = 0; n < fade; n++) signal[signal.length - 1 - n] *= n / fade;
  let peak = 0;
  for (const sample of signal) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0) {
    const scale = target / peak;
    for (let n = 0; n < signal.length; n++) signal[n] *= scale;
  }
  return signal;
}

/** Start time (seconds) of each sounding string in a strum, low E first. */
export function strumOffsets(
  notes: ReadonlyArray<number | null>,
  direction: StrumDirection = "down",
  spreadS = DEFAULT_SPREAD_S,
): Array<number | null> {
  const order = notes
    .map((midi, string) => ({ midi, string }))
    .filter((entry) => entry.midi !== null);
  if (direction === "up") order.reverse();
  const offsets: Array<number | null> = notes.map(() => null);
  order.forEach((entry, position) => {
    offsets[entry.string] = position * spreadS;
  });
  return offsets;
}

/** Renders a strum of the given strings (low E → high E, null = muted). */
export function renderStrum(
  notes: ReadonlyArray<number | null>,
  sampleRate: number,
  options: StrumOptions = {},
): Float32Array {
  const direction = options.direction ?? "down";
  const velocity = options.velocity ?? 0.85;
  const out = new Float32Array(Math.ceil((options.durationS ?? DEFAULT_STRUM_S) * sampleRate));
  const spreadS = options.strumSpreadS ?? DEFAULT_SPREAD_S;
  const offsets = strumOffsets(notes, direction, spreadS);
  const random = mulberry32(options.seed ?? 1);
  const sounding = offsets.filter((offset) => offset !== null).length;

  notes.forEach((midi, string) => {
    const offset = offsets[string];
    if (midi === null || offset === null) return;
    // The pick loses a little energy as it crosses each string.
    const position = spreadS > 0 ? offset / spreadS : 0;
    const taper = 1 - 0.25 * (position / Math.max(1, sounding - 1));
    const jitterS = (random() - 0.5) * 0.004;
    renderPluck(out, Math.max(0, Math.round((offset + jitterS) * sampleRate)), midi, sampleRate, {
      velocity: velocity * taper * (0.92 + random() * 0.08),
      seed: Math.floor(random() * 2 ** 31),
    });
  });

  return normalise(applyBody(out, sampleRate));
}

/** Renders a single plucked string with the same body as a strum. */
export function renderNote(midi: number, sampleRate: number, options: PluckOptions & { durationS?: number } = {}): Float32Array {
  const out = new Float32Array(Math.ceil((options.durationS ?? 2.2) * sampleRate));
  renderPluck(out, 0, midi, sampleRate, options);
  return normalise(applyBody(out, sampleRate), 0.6);
}
