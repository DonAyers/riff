/**
 * Pure helpers for the looper's metronome. The click is rendered into a buffer that loops
 * alongside the tracks on the same AudioContext clock, so it cannot drift from them; nothing
 * here is scheduled with timers.
 */

export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const DEFAULT_BPM = 100;
export const DEFAULT_BEATS_PER_BAR = 4;
export const BEATS_PER_BAR_OPTIONS = [2, 3, 4, 5, 6, 7] as const;

const CLICK_SECONDS = 0.03;
const CLICK_DECAY_SECONDS = 0.006;
const ACCENT_HZ = 1760;
const BEAT_HZ = 1175;
const ACCENT_GAIN = 0.7;
const BEAT_GAIN = 0.45;
/** Taps further apart than this start a new tempo. */
const TAP_RESET_MS = 2000;
const TAP_HISTORY = 5;
/** Tempo a fitted loop aims for when several bar counts would fit. */
const FIT_TARGET_BPM = 110;
const FIT_MIN_BPM = 70;
const FIT_MAX_BPM = 160;

export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm * 10) / 10));
}

/**
 * One bar in whole frames. Rounding the bar (not the beat) keeps a recorded loop an exact
 * multiple of the click buffer, so the two never slip apart however long they loop.
 */
export function getBarFrames(bpm: number, beatsPerBar: number, sampleRate: number): number {
  return Math.round((60 / bpm) * beatsPerBar * sampleRate);
}

/**
 * Clicks for `beats` evenly spaced beats over `lengthFrames`, with the downbeat of each bar
 * accented. Beat starts are rounded per beat from the buffer start, so error never adds up.
 */
export function renderClickTrack(
  lengthFrames: number,
  beats: number,
  beatsPerBar: number,
  sampleRate: number
): Float32Array<ArrayBuffer> {
  const output = new Float32Array(Math.max(0, Math.round(lengthFrames)));
  if (output.length === 0 || beats <= 0) return output;

  const clickFrames = Math.round(CLICK_SECONDS * sampleRate);
  for (let beat = 0; beat < beats; beat += 1) {
    const start = Math.round((beat * output.length) / beats);
    const isAccent = beat % beatsPerBar === 0;
    const hz = isAccent ? ACCENT_HZ : BEAT_HZ;
    const gain = isAccent ? ACCENT_GAIN : BEAT_GAIN;

    for (let i = 0; i < clickFrames && start + i < output.length; i += 1) {
      const t = i / sampleRate;
      output[start + i] += gain * Math.exp(-t / CLICK_DECAY_SECONDS) * Math.sin(2 * Math.PI * hz * t);
    }
  }

  return output;
}

/**
 * Whole bars between the start of the take and the press that closes it, rounded to the
 * nearest bar line and at least one bar. A slightly late press still closes on the bar line
 * the player meant.
 */
export function quantizeBars(elapsedFrames: number, barFrames: number): number {
  return Math.max(1, Math.round(elapsedFrames / barFrames));
}

/** Adds a tap, starting over when the previous one was too long ago. Keeps the last few. */
export function addTap(tapTimesMs: readonly number[], nowMs: number): number[] {
  const last = tapTimesMs[tapTimesMs.length - 1];
  if (last === undefined || nowMs - last > TAP_RESET_MS) return [nowMs];
  return [...tapTimesMs.slice(-(TAP_HISTORY - 1)), nowMs];
}

/** Tempo from the average gap between taps, or null until there are two. */
export function getTapTempo(tapTimesMs: readonly number[]): number | null {
  if (tapTimesMs.length < 2) return null;
  const averageMs = (tapTimesMs[tapTimesMs.length - 1] - tapTimesMs[0]) / (tapTimesMs.length - 1);
  return averageMs > 0 ? clampBpm(60000 / averageMs) : null;
}

export interface FittedTempo {
  beats: number;
  bpm: number;
}

/**
 * Guesses the tempo of a loop that was played freely: try whole bar counts (1, 2, 4, 8, 16)
 * and keep the one whose tempo lands closest to a typical one in a sensible range. If no bar
 * count fits, count whole beats instead. The player fixes a wrong guess with ×2 / ÷2.
 */
export function fitTempo(loopSeconds: number, beatsPerBar: number): FittedTempo {
  const bpmFor = (beats: number) => (beats * 60) / loopSeconds;
  let best: FittedTempo | null = null;

  for (const bars of [1, 2, 4, 8, 16]) {
    const beats = bars * beatsPerBar;
    const bpm = bpmFor(beats);
    if (bpm < FIT_MIN_BPM || bpm > FIT_MAX_BPM) continue;
    if (!best || Math.abs(bpm - FIT_TARGET_BPM) < Math.abs(best.bpm - FIT_TARGET_BPM)) {
      best = { beats, bpm };
    }
  }

  if (best) return best;
  const beats = Math.max(1, Math.round((FIT_TARGET_BPM * loopSeconds) / 60));
  return { beats, bpm: bpmFor(beats) };
}

/** Which beat of the bar (0-based) is sounding at `positionS` into a grid of `beatS` beats. */
export function getBeatInBar(positionS: number, beatS: number, beatsPerBar: number): number {
  if (beatS <= 0 || positionS < 0) return -1;
  return Math.floor(positionS / beatS + 1e-9) % beatsPerBar;
}

export function formatBpm(bpm: number): string {
  return Number.isInteger(Math.round(bpm * 10) / 10) ? String(Math.round(bpm)) : bpm.toFixed(1);
}
