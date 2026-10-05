/**
 * Pure helpers for the multi-track looper. Everything here works in sample frames on the
 * AudioContext clock so tracks stay sample-aligned: AudioWorkletGlobalScope.currentFrame and
 * AudioContext.currentTime * sampleRate count the same frames.
 */

export const LOOPER_TRACK_COUNT = 4;
export const MIN_LOOP_SECONDS = 0.5;
export const MAX_LOOP_SECONDS = 60;
export const EDGE_FADE_SECONDS = 0.004;
export const MIN_LATENCY_NUDGE_MS = -100;
export const MAX_LATENCY_NUDGE_MS = 300;

export interface CaptureChunk {
  /** Context frame of the first sample in `samples`. */
  startFrame: number;
  samples: Float32Array;
}

/** Positive modulo, so positions before the loop epoch still land inside the loop. */
export function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Seconds into the loop at `timeS`, where the loop's position 0 played at `epochS`. */
export function getLoopPositionSeconds(timeS: number, epochS: number, durationS: number): number {
  return durationS > 0 ? positiveModulo(timeS - epochS, durationS) : 0;
}

/** The first loop start (position 0) at or after `timeS`. */
export function getNextLoopBoundarySeconds(timeS: number, epochS: number, durationS: number): number {
  if (durationS <= 0) return timeS;
  const loopsElapsed = Math.ceil((timeS - epochS) / durationS - 1e-9);
  return epochS + Math.max(0, loopsElapsed) * durationS;
}

/**
 * Copies frames [fromFrame, fromFrame + length) out of the captured chunks. Gaps (dropped
 * render quanta or audio before capture began) are left as silence.
 */
export function extractFrames(
  chunks: readonly CaptureChunk[],
  fromFrame: number,
  length: number
): Float32Array<ArrayBuffer> {
  const output = new Float32Array(Math.max(0, length));
  const toFrame = fromFrame + output.length;

  for (const chunk of chunks) {
    const chunkEnd = chunk.startFrame + chunk.samples.length;
    const overlapStart = Math.max(fromFrame, chunk.startFrame);
    const overlapEnd = Math.min(toFrame, chunkEnd);

    if (overlapEnd > overlapStart) {
      output.set(
        chunk.samples.subarray(overlapStart - chunk.startFrame, overlapEnd - chunk.startFrame),
        overlapStart - fromFrame
      );
    }
  }

  return output;
}

/** The last frame (exclusive) the capture has delivered so far. */
export function getCapturedEndFrame(chunks: readonly CaptureChunk[]): number {
  const last = chunks[chunks.length - 1];
  return last ? last.startFrame + last.samples.length : 0;
}

/** Drops chunks that end before `keepFromFrame` to bound memory while the mic stays open. */
export function pruneChunks(chunks: CaptureChunk[], keepFromFrame: number): CaptureChunk[] {
  return chunks.filter((chunk) => chunk.startFrame + chunk.samples.length > keepFromFrame);
}

/**
 * Short linear fades at both ends so the loop seam does not click when the waveform does
 * not line up with itself.
 */
export function applyEdgeFades<T extends Float32Array>(samples: T, fadeFrames: number): T {
  const frames = Math.min(Math.floor(fadeFrames), Math.floor(samples.length / 2));

  for (let i = 0; i < frames; i += 1) {
    const gain = i / frames;
    samples[i] *= gain;
    samples[samples.length - 1 - i] *= gain;
  }

  return samples;
}

/** Peak amplitude per bin, for drawing a small waveform. */
export function computePeaks(samples: Float32Array, binCount: number): number[] {
  if (samples.length === 0 || binCount <= 0) return [];
  const binSize = samples.length / binCount;
  const peaks: number[] = [];

  for (let bin = 0; bin < binCount; bin += 1) {
    const start = Math.floor(bin * binSize);
    const end = Math.max(start + 1, Math.floor((bin + 1) * binSize));
    let peak = 0;
    for (let i = start; i < end && i < samples.length; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i]));
    }
    peaks.push(Math.min(1, peak));
  }

  return peaks;
}

export interface LatencySources {
  baseLatency?: number;
  outputLatency?: number;
  inputLatency?: number;
  nudgeMs?: number;
}

/**
 * Round trip from "the loop sample left the speakers" to "the player's answer reached the
 * worklet". Browsers report only parts of it (Safari has no outputLatency), so the player
 * can add a nudge on top.
 */
export function estimateRoundTripLatencySeconds({
  baseLatency = 0,
  outputLatency = 0,
  inputLatency = 0,
  nudgeMs = 0,
}: LatencySources): number {
  const safe = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);
  return Math.max(0, safe(baseLatency) + safe(outputLatency) + safe(inputLatency) + nudgeMs / 1000);
}

export function clampLatencyNudgeMs(nudgeMs: number): number {
  if (!Number.isFinite(nudgeMs)) return 0;
  return Math.min(MAX_LATENCY_NUDGE_MS, Math.max(MIN_LATENCY_NUDGE_MS, Math.round(nudgeMs)));
}

export function formatLoopTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}
