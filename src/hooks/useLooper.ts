import { useCallback, useEffect, useRef, useState } from "react";
import looperCaptureWorkletUrl from "../worklets/looper-capture.worklet?worker&url";
import {
  applyEdgeFades,
  clampLatencyNudgeMs,
  clampLoopWindow,
  computePeaks,
  EDGE_FADE_SECONDS,
  estimateRoundTripLatencySeconds,
  extractFrames,
  getCapturedEndFrame,
  getLoopPositionSeconds,
  getNextLoopBoundarySeconds,
  LOOPER_TRACK_COUNT,
  MAX_LOOP_SECONDS,
  MIN_LOOP_SECONDS,
  positiveModulo,
  pruneChunks,
  renderLoopWindow,
  SEAM_CROSSFADE_SECONDS,
  TAKE_HANDLE_SECONDS,
  type CaptureChunk,
  type LoopWindow,
} from "../lib/looper";

export type LooperTrackStatus = "empty" | "armed" | "recording" | "playing";

export interface LooperTrackState {
  status: LooperTrackStatus;
  muted: boolean;
  volume: number;
  peaks: number[];
}

export interface LoopPosition {
  positionS: number;
  durationS: number;
}

/** Loop edges relative to the presses that recorded the first take, in milliseconds. */
export interface LoopTrim {
  /** Negative starts the loop before the start press. */
  startMs: number;
  /** Positive ends the loop after the closing press. */
  endMs: number;
}

export interface UseLooperReturn {
  tracks: LooperTrackState[];
  /** Set while the first take is the only track, so its edges can still move. */
  loopTrim: LoopTrim | null;
  canUndo: boolean;
  loopDurationS: number | null;
  isPlaying: boolean;
  isStarting: boolean;
  error: string | null;
  latencyNudgeMs: number;
  setLatencyNudgeMs: (nudgeMs: number) => void;
  toggleRecord: (trackIndex: number) => Promise<void>;
  toggleMute: (trackIndex: number) => void;
  setVolume: (trackIndex: number, volume: number) => void;
  clearTrack: (trackIndex: number) => void;
  clearAll: () => void;
  togglePlayback: () => void;
  getLoopPosition: () => LoopPosition | null;
  setLoopTrim: (patch: Partial<LoopTrim>) => void;
  resetLoopTrim: () => void;
  undoLastTake: () => void;
}

type RecordJob =
  | { kind: "first"; startFrame: number; timers: number[] }
  | { kind: "overdub"; startFrame: number; timers: number[] };

/** The first take's recording with handles on both sides, so its loop edges can move. */
interface BaseTake {
  trackIndex: number;
  /** Context frame of `source[0]`. */
  sourceStartFrame: number;
  /** Context frame of the start press: the take's frame 0. */
  originFrame: number;
  /** Frames from the start press to the closing press. */
  closeFrame: number;
  source: Float32Array;
  window: LoopWindow;
  /** Context frame the post-roll handle is complete at, until it has been collected. */
  postRollUntilFrame: number | null;
}

interface UndoSnapshot {
  trackIndex: number;
  buffer: AudioBuffer | null;
  peaks: number[];
  baseTake: BaseTake | null;
}

interface LooperEngine {
  context: AudioContext;
  stream: MediaStream;
  micSource: MediaStreamAudioSourceNode;
  captureNode: AudioWorkletNode;
  captureSink: GainNode;
  trackGains: GainNode[];
  inputLatencyS: number;
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

const LATENCY_STORAGE_KEY = "riff:looper-latency-nudge-ms";
const START_LOOKAHEAD_S = 0.03;
const ARM_LOOKAHEAD_S = 0.1;
const CAPTURE_POLL_MS = 25;
const PEAK_BINS = 48;
const LOOPER_MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 1 },
};

function createEmptyTrack(): LooperTrackState {
  return { status: "empty", muted: false, volume: 0.9, peaks: [] };
}

function getTakeTrim(take: BaseTake, sampleRate: number): LoopTrim {
  return {
    startMs: Math.round((take.window.startFrame / sampleRate) * 1000),
    endMs: Math.round(((take.window.endFrame - take.closeFrame) / sampleRate) * 1000),
  };
}

function readStoredNudge(): number {
  try {
    return clampLatencyNudgeMs(Number(localStorage.getItem(LATENCY_STORAGE_KEY) ?? 0));
  } catch {
    return 0;
  }
}

function disposeEngine(engine: LooperEngine | null) {
  if (!engine) return;
  engine.captureNode.port.onmessage = null;
  engine.micSource.disconnect();
  engine.captureNode.disconnect();
  engine.stream.getTracks().forEach((track) => track.stop());
  void engine.context.close().catch(() => undefined);
  setAudioSessionType("auto");
}

function createTrackBuffer(engine: LooperEngine, samples: Float32Array<ArrayBuffer>): AudioBuffer {
  // Match the context rate exactly so looping never resamples or drifts.
  const buffer = engine.context.createBuffer(1, samples.length, engine.context.sampleRate);
  buffer.copyToChannel(samples, 0);
  return buffer;
}

function setAudioSessionType(type: string) {
  // Safari 16.4+: tell iOS we play and record at once so it keeps media routing/volume.
  const audioSession = (navigator as AudioSessionNavigator).audioSession;
  if (audioSession) {
    try {
      audioSession.type = type;
    } catch {
      // Unsupported value on this browser; nothing to do.
    }
  }
}

export function useLooper(): UseLooperReturn {
  const [tracks, setTracks] = useState<LooperTrackState[]>(() =>
    Array.from({ length: LOOPER_TRACK_COUNT }, createEmptyTrack)
  );
  const [loopDurationS, setLoopDurationS] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latencyNudgeMs, setLatencyNudgeState] = useState(readStoredNudge);
  const [baseTrim, setBaseTrim] = useState<(LoopTrim & { trackIndex: number }) | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const engineRef = useRef<LooperEngine | null>(null);
  const enginePromiseRef = useRef<Promise<LooperEngine> | null>(null);
  const chunksRef = useRef<CaptureChunk[]>([]);
  const buffersRef = useRef<(AudioBuffer | null)[]>(Array(LOOPER_TRACK_COUNT).fill(null));
  const playersRef = useRef<(AudioBufferSourceNode | null)[]>(Array(LOOPER_TRACK_COUNT).fill(null));
  const jobsRef = useRef<(RecordJob | null)[]>(Array(LOOPER_TRACK_COUNT).fill(null));
  const loopEpochRef = useRef(0);
  const loopDurationRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);
  const tracksRef = useRef(tracks);
  const latencyNudgeRef = useRef(latencyNudgeMs);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const isMountedRef = useRef(true);
  const baseTakeRef = useRef<BaseTake | null>(null);
  const undoRef = useRef<UndoSnapshot | null>(null);
  const onPostRollRef = useRef<(take: BaseTake) => void>(() => undefined);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const updateTrack = useCallback((index: number, patch: Partial<LooperTrackState>) => {
    setTracks((current) =>
      current.map((track, trackIndex) => (trackIndex === index ? { ...track, ...patch } : track))
    );
  }, []);

  const setLatencyNudgeMs = useCallback((nudgeMs: number) => {
    const clamped = clampLatencyNudgeMs(nudgeMs);
    latencyNudgeRef.current = clamped;
    setLatencyNudgeState(clamped);
    try {
      localStorage.setItem(LATENCY_STORAGE_KEY, String(clamped));
    } catch {
      // Not persisted in private mode.
    }
  }, []);

  const ensureEngine = useCallback(async (): Promise<LooperEngine> => {
    if (engineRef.current) {
      return engineRef.current;
    }

    if (!enginePromiseRef.current) {
      enginePromiseRef.current = (async () => {
        setAudioSessionType("play-and-record");
        // Create and resume the context before any await so iOS still sees the tap.
        const context = new AudioContext({ latencyHint: "interactive" });
        const resumePromise = context.state === "running" ? Promise.resolve() : context.resume();
        let stream: MediaStream | null = null;

        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: LOOPER_MIC_CONSTRAINTS });
          await resumePromise;
          await context.audioWorklet.addModule(looperCaptureWorkletUrl);

          const micSource = context.createMediaStreamSource(stream);
          const captureNode = new AudioWorkletNode(context, "looper-capture-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
          });
          // The worklet only runs while connected to the destination; keep it silent so the
          // mic is never monitored through the speakers (that would feed back).
          const captureSink = context.createGain();
          captureSink.gain.value = 0;
          micSource.connect(captureNode).connect(captureSink).connect(context.destination);

          const handleFrames = Math.round(TAKE_HANDLE_SECONDS * context.sampleRate);
          captureNode.port.onmessage = (event: MessageEvent<CaptureChunk>) => {
            const chunks = [...chunksRef.current, event.data];
            const take = baseTakeRef.current;
            const holds = jobsRef.current
              .filter((job): job is RecordJob => job !== null)
              .map((job) => job.startFrame);
            if (take?.postRollUntilFrame != null) holds.push(take.originFrame);

            // Always keep a pre-roll handle, so a take's start can later move earlier.
            const keepFrom =
              (holds.length > 0 ? Math.min(...holds) : getCapturedEndFrame(chunks)) - handleFrames;
            chunksRef.current = pruneChunks(chunks, keepFrom);

            if (take?.postRollUntilFrame != null && getCapturedEndFrame(chunksRef.current) >= take.postRollUntilFrame) {
              onPostRollRef.current(take);
            }
          };

          const trackGains = Array.from({ length: LOOPER_TRACK_COUNT }, (_, index) => {
            const gain = context.createGain();
            const track = tracksRef.current[index];
            gain.gain.value = track.muted ? 0 : track.volume;
            gain.connect(context.destination);
            return gain;
          });
          const settings = stream.getAudioTracks()[0]?.getSettings() as
            | (MediaTrackSettings & { latency?: number })
            | undefined;

          const engine: LooperEngine = {
            context,
            stream,
            micSource,
            captureNode,
            captureSink,
            trackGains,
            inputLatencyS: settings?.latency ?? 0,
          };
          if (!isMountedRef.current) {
            // The page was left while the mic permission prompt was open.
            disposeEngine(engine);
            throw new Error("Looper closed.");
          }

          engineRef.current = engine;

          const wakeLock = (navigator as WakeLockNavigator).wakeLock;
          if (wakeLock) {
            wakeLock.request("screen").then(
              (sentinel) => {
                // The looper may have closed while the request was pending.
                if (isMountedRef.current) {
                  wakeLockRef.current = sentinel;
                } else {
                  void sentinel.release().catch(() => undefined);
                }
              },
              () => undefined
            );
          }

          return engine;
        } catch (err) {
          stream?.getTracks().forEach((track) => track.stop());
          if (context.state !== "closed") void context.close().catch(() => undefined);
          setAudioSessionType("auto");
          throw err;
        }
      })().finally(() => {
        enginePromiseRef.current = null;
      });
    }

    return enginePromiseRef.current;
  }, []);

  const frameNow = (engine: LooperEngine) =>
    Math.round(engine.context.currentTime * engine.context.sampleRate);

  /** Stops a track's player now, or at `whenS` so a replacement can take over without a gap. */
  const stopPlayer = useCallback((index: number, whenS?: number) => {
    const player = playersRef.current[index];
    playersRef.current[index] = null;
    if (!player) return;

    player.onended = null;
    try {
      player.stop(whenS);
    } catch {
      // Already stopped.
    }
    if (whenS === undefined) {
      player.disconnect();
    } else {
      player.onended = () => player.disconnect();
    }
  }, []);

  /** Starts a track's loop so its position matches the shared loop clock. */
  const startPlayer = useCallback((index: number, whenS?: number) => {
    const engine = engineRef.current;
    const buffer = buffersRef.current[index];
    const durationS = loopDurationRef.current;
    if (!engine || !buffer || !durationS) return;

    const startAtS = whenS ?? engine.context.currentTime + START_LOOKAHEAD_S;
    stopPlayer(index, startAtS);
    const player = engine.context.createBufferSource();
    player.buffer = buffer;
    player.loop = true;
    player.connect(engine.trackGains[index]);

    const offsetS = getLoopPositionSeconds(startAtS, loopEpochRef.current, durationS);
    player.start(startAtS, offsetS);
    playersRef.current[index] = player;
  }, [stopPlayer]);

  const clearJob = useCallback((index: number) => {
    const job = jobsRef.current[index];
    job?.timers.forEach((timer) => window.clearTimeout(timer));
    jobsRef.current[index] = null;
  }, []);

  /** Waits until the worklet has delivered `endFrame`, then calls `onReady`. */
  const whenCaptured = useCallback((index: number, endFrame: number, onReady: () => void) => {
    const job = jobsRef.current[index];
    if (!job) return;

    if (getCapturedEndFrame(chunksRef.current) >= endFrame) {
      onReady();
      return;
    }

    job.timers.push(window.setTimeout(() => whenCaptured(index, endFrame, onReady), CAPTURE_POLL_MS));
  }, []);

  const forgetUndo = useCallback(() => {
    undoRef.current = null;
    setCanUndo(false);
  }, []);

  const setBaseTake = useCallback((take: BaseTake | null) => {
    baseTakeRef.current = take;
    const engine = engineRef.current;
    setBaseTrim(take && engine ? { trackIndex: take.trackIndex, ...getTakeTrim(take, engine.context.sampleRate) } : null);
  }, []);

  /** Swaps a track's audio, keeping it in step with the loop if the loop is playing. */
  const setTrackBuffer = useCallback((index: number, buffer: AudioBuffer | null, peaks: number[]) => {
    buffersRef.current[index] = buffer;
    if (!buffer) {
      stopPlayer(index);
      updateTrack(index, { status: "empty", peaks: [] });
      return;
    }

    updateTrack(index, { status: "playing", peaks });
    if (isPlayingRef.current) startPlayer(index);
  }, [startPlayer, stopPlayer, updateTrack]);

  /** Keeps what a take replaced, so "Undo" can put it back. */
  const rememberForUndo = useCallback((index: number) => {
    undoRef.current = {
      trackIndex: index,
      buffer: buffersRef.current[index],
      peaks: tracksRef.current[index].peaks,
      baseTake: baseTakeRef.current,
    };
    setCanUndo(true);
  }, []);

  const commitTake = useCallback((index: number, fromFrame: number, lengthFrames: number) => {
    const engine = engineRef.current;
    if (!engine) return;

    const samples = extractFrames(chunksRef.current, fromFrame, lengthFrames);
    applyEdgeFades(samples, EDGE_FADE_SECONDS * engine.context.sampleRate);
    clearJob(index);
    rememberForUndo(index);
    // A new take on the first track replaces the recording its edges were trimmed from.
    if (baseTakeRef.current?.trackIndex === index) setBaseTake(null);
    setTrackBuffer(index, createTrackBuffer(engine, samples), computePeaks(samples, PEAK_BINS));
  }, [clearJob, rememberForUndo, setBaseTake, setTrackBuffer]);

  /** Renders the base take's current window and plays it from the same spot in the music. */
  const applyLoopWindow = useCallback((take: BaseTake, next: LoopWindow) => {
    const engine = engineRef.current;
    if (!engine) return;

    const { context } = engine;
    const sampleRate = context.sampleRate;
    const previous = take.window;
    take.window = next;
    const samples = renderLoopWindow(
      take.source,
      take.originFrame - take.sourceStartFrame,
      next,
      SEAM_CROSSFADE_SECONDS * sampleRate
    );
    const durationS = samples.length / sampleRate;
    const previousDurationS = loopDurationRef.current;

    if (isPlayingRef.current && previousDurationS) {
      // Keep hearing the same moment of the take: moving the start shifts the loop position.
      const nowS = context.currentTime;
      const positionS = getLoopPositionSeconds(nowS, loopEpochRef.current, previousDurationS);
      const shiftS = (next.startFrame - previous.startFrame) / sampleRate;
      loopEpochRef.current = nowS - positiveModulo(positionS - shiftS, durationS);
    }

    loopDurationRef.current = durationS;
    setLoopDurationS(durationS);
    setBaseTake(take);
    setTrackBuffer(take.trackIndex, createTrackBuffer(engine, samples), computePeaks(samples, PEAK_BINS));
  }, [setBaseTake, setTrackBuffer]);

  const commitFirstTake = useCallback((index: number, startFrame: number, stopFrame: number) => {
    const engine = engineRef.current;
    if (!engine) return;

    const handleFrames = Math.round(TAKE_HANDLE_SECONDS * engine.context.sampleRate);
    const sourceStartFrame = startFrame - handleFrames;
    const sourceEndFrame = Math.min(getCapturedEndFrame(chunksRef.current), stopFrame + handleFrames);
    const take: BaseTake = {
      trackIndex: index,
      sourceStartFrame,
      originFrame: startFrame,
      closeFrame: stopFrame - startFrame,
      source: extractFrames(chunksRef.current, sourceStartFrame, sourceEndFrame - sourceStartFrame),
      window: { startFrame: 0, endFrame: stopFrame - startFrame },
      postRollUntilFrame: stopFrame + handleFrames,
    };

    clearJob(index);
    rememberForUndo(index);
    applyLoopWindow(take, take.window);
  }, [applyLoopWindow, clearJob, rememberForUndo]);

  useEffect(() => {
    // Once the audio after the closing press has arrived, extending the loop plays it.
    onPostRollRef.current = (take) => {
      const engine = engineRef.current;
      if (!engine) return;

      const coveredUntil = take.sourceStartFrame + take.source.length - take.originFrame;
      take.source = extractFrames(chunksRef.current, take.sourceStartFrame, take.postRollUntilFrame! - take.sourceStartFrame);
      take.postRollUntilFrame = null;

      const crossfadeFrames = Math.round(SEAM_CROSSFADE_SECONDS * engine.context.sampleRate);
      if (baseTakeRef.current === take && take.window.endFrame + crossfadeFrames > coveredUntil) {
        applyLoopWindow(take, take.window);
      }
    };
  }, [applyLoopWindow]);

  const finishFirstLoop = useCallback((index: number) => {
    const engine = engineRef.current;
    const job = jobsRef.current[index];
    if (!engine || !job || job.kind !== "first") return;

    const stopFrame = frameNow(engine);
    const lengthFrames = stopFrame - job.startFrame;
    const durationS = lengthFrames / engine.context.sampleRate;

    if (durationS < MIN_LOOP_SECONDS) {
      clearJob(index);
      updateTrack(index, { status: "empty" });
      setError(`Loops need at least ${MIN_LOOP_SECONDS} seconds. Try again.`);
      return;
    }

    // The press that ends the first take is the loop's seam: position 0 plays right after it.
    loopEpochRef.current = stopFrame / engine.context.sampleRate;
    loopDurationRef.current = lengthFrames / engine.context.sampleRate;
    setLoopDurationS(loopDurationRef.current);
    isPlayingRef.current = true;
    setIsPlaying(true);
    job.timers.forEach((timer) => window.clearTimeout(timer));
    job.timers = [];

    // Wait for the seam crossfade's audio past the closing press too.
    const crossfadeFrames = Math.ceil(SEAM_CROSSFADE_SECONDS * engine.context.sampleRate);
    whenCaptured(index, stopFrame + crossfadeFrames, () => commitFirstTake(index, job.startFrame, stopFrame));
  }, [clearJob, commitFirstTake, updateTrack, whenCaptured]);

  const playAll = useCallback(() => {
    const engine = engineRef.current;
    if (!engine || !loopDurationRef.current) return;

    const startAtS = engine.context.currentTime + START_LOOKAHEAD_S;
    loopEpochRef.current = startAtS;
    buffersRef.current.forEach((buffer, index) => {
      if (buffer) startPlayer(index, startAtS);
    });
    isPlayingRef.current = true;
    setIsPlaying(true);
  }, [startPlayer]);

  const cancelPendingTakes = useCallback(() => {
    jobsRef.current.forEach((job, index) => {
      if (!job) return;
      clearJob(index);
      updateTrack(index, { status: buffersRef.current[index] ? "playing" : "empty" });
    });
  }, [clearJob, updateTrack]);

  const resetLoopIfEmpty = useCallback(() => {
    if (buffersRef.current.some(Boolean) || jobsRef.current.some(Boolean)) return;
    loopDurationRef.current = null;
    setLoopDurationS(null);
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  const stopAll = useCallback(() => {
    cancelPendingTakes();
    playersRef.current.forEach((_, index) => stopPlayer(index));
    isPlayingRef.current = false;
    setIsPlaying(false);
    // Stopping before the first take was committed leaves no audio: drop the loop too.
    resetLoopIfEmpty();
  }, [cancelPendingTakes, resetLoopIfEmpty, stopPlayer]);

  const startOverdub = useCallback((index: number, engine: LooperEngine) => {
    const durationS = loopDurationRef.current;
    if (!durationS) return;

    if (!isPlayingRef.current) {
      playAll();
    }

    const { context } = engine;
    const sampleRate = context.sampleRate;
    const boundaryS = getNextLoopBoundarySeconds(
      context.currentTime + ARM_LOOKAHEAD_S,
      loopEpochRef.current,
      durationS
    );
    const lengthFrames = buffersRef.current.find(Boolean)?.length ?? Math.round(durationS * sampleRate);
    const latencyS = estimateRoundTripLatencySeconds({
      baseLatency: context.baseLatency,
      outputLatency: context.outputLatency,
      inputLatency: engine.inputLatencyS,
      nudgeMs: latencyNudgeRef.current,
    });
    // What the player plays along to position 0 reaches the worklet one round trip later.
    const fromFrame = Math.round(boundaryS * sampleRate) + Math.round(latencyS * sampleRate);
    const job: RecordJob = { kind: "overdub", startFrame: fromFrame, timers: [] };
    jobsRef.current[index] = job;
    updateTrack(index, { status: "armed" });

    const msUntil = (timeS: number) => Math.max(0, (timeS - context.currentTime) * 1000);
    job.timers.push(
      window.setTimeout(() => updateTrack(index, { status: "recording" }), msUntil(boundaryS)),
      window.setTimeout(() => {
        whenCaptured(index, fromFrame + lengthFrames, () => commitTake(index, fromFrame, lengthFrames));
      }, msUntil(boundaryS + durationS + latencyS))
    );
  }, [commitTake, playAll, updateTrack, whenCaptured]);

  const toggleRecord = useCallback(async (index: number) => {
    const job = jobsRef.current[index];

    if (job?.kind === "first") {
      finishFirstLoop(index);
      return;
    }

    if (job?.kind === "overdub") {
      clearJob(index);
      updateTrack(index, { status: buffersRef.current[index] ? "playing" : "empty" });
      return;
    }

    if (!loopDurationRef.current && jobsRef.current.some(Boolean)) {
      return;
    }

    setError(null);
    let engine: LooperEngine;
    try {
      setIsStarting(!engineRef.current);
      engine = await ensureEngine();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Microphone unavailable: ${err.message}`
          : "Microphone unavailable."
      );
      return;
    } finally {
      if (isMountedRef.current) setIsStarting(false);
    }

    if (!isMountedRef.current) return;

    if (loopDurationRef.current) {
      startOverdub(index, engine);
      return;
    }

    const startFrame = frameNow(engine);
    const firstJob: RecordJob = { kind: "first", startFrame, timers: [] };
    jobsRef.current[index] = firstJob;
    firstJob.timers.push(window.setTimeout(() => finishFirstLoop(index), MAX_LOOP_SECONDS * 1000));
    updateTrack(index, { status: "recording" });
  }, [clearJob, ensureEngine, finishFirstLoop, startOverdub, updateTrack]);

  const applyGain = useCallback((index: number, track: LooperTrackState) => {
    const engine = engineRef.current;
    if (!engine) return;
    // Ramp instead of jumping so mute/volume changes do not click.
    engine.trackGains[index].gain.setTargetAtTime(
      track.muted ? 0 : track.volume,
      engine.context.currentTime,
      0.01
    );
  }, []);

  const toggleMute = useCallback((index: number) => {
    const track = tracksRef.current[index];
    const next = { ...track, muted: !track.muted };
    applyGain(index, next);
    updateTrack(index, { muted: next.muted });
  }, [applyGain, updateTrack]);

  const setVolume = useCallback((index: number, volume: number) => {
    const clamped = Math.min(1, Math.max(0, volume));
    const next = { ...tracksRef.current[index], volume: clamped };
    applyGain(index, next);
    updateTrack(index, { volume: clamped });
  }, [applyGain, updateTrack]);

  const clearTrack = useCallback((index: number) => {
    clearJob(index);
    stopPlayer(index);
    buffersRef.current[index] = null;
    updateTrack(index, { status: "empty", peaks: [] });
    if (baseTakeRef.current?.trackIndex === index) setBaseTake(null);
    forgetUndo();
    resetLoopIfEmpty();
  }, [clearJob, forgetUndo, resetLoopIfEmpty, setBaseTake, stopPlayer, updateTrack]);

  const clearAll = useCallback(() => {
    for (let index = 0; index < LOOPER_TRACK_COUNT; index += 1) {
      clearJob(index);
      stopPlayer(index);
      buffersRef.current[index] = null;
    }
    setTracks((current) => current.map((track) => ({ ...track, status: "empty", peaks: [] })));
    setBaseTake(null);
    forgetUndo();
    resetLoopIfEmpty();
  }, [clearJob, forgetUndo, resetLoopIfEmpty, setBaseTake, stopPlayer]);

  /** Edges can move only while the first take is the only audio, so no layer falls out of time. */
  const getTrimmableTake = useCallback((): BaseTake | null => {
    const take = baseTakeRef.current;
    if (!take || jobsRef.current.some(Boolean)) return null;
    return buffersRef.current.every((buffer, index) => !buffer || index === take.trackIndex) ? take : null;
  }, []);

  const setLoopTrim = useCallback((patch: Partial<LoopTrim>) => {
    const engine = engineRef.current;
    const take = getTrimmableTake();
    if (!engine || !take) return;

    const sampleRate = engine.context.sampleRate;
    const toFrames = (ms: number) => Math.round((ms / 1000) * sampleRate);
    const handleFrames = Math.round(TAKE_HANDLE_SECONDS * sampleRate);
    const next = clampLoopWindow(
      {
        startFrame: patch.startMs === undefined ? take.window.startFrame : toFrames(patch.startMs),
        endFrame: patch.endMs === undefined ? take.window.endFrame : take.closeFrame + toFrames(patch.endMs),
      },
      {
        minStartFrame: -handleFrames,
        maxEndFrame: take.closeFrame + handleFrames,
        minLengthFrames: Math.ceil(MIN_LOOP_SECONDS * sampleRate),
      },
      patch.startMs === undefined ? "end" : "start"
    );
    if (next.startFrame === take.window.startFrame && next.endFrame === take.window.endFrame) return;

    // Undo restores a whole track buffer, which no longer fits once the loop length changes.
    forgetUndo();
    applyLoopWindow(take, next);
  }, [applyLoopWindow, forgetUndo, getTrimmableTake]);

  const resetLoopTrim = useCallback(() => {
    setLoopTrim({ startMs: 0, endMs: 0 });
  }, [setLoopTrim]);

  const undoLastTake = useCallback(() => {
    const snapshot = undoRef.current;
    if (!snapshot || jobsRef.current.some(Boolean)) return;

    forgetUndo();
    setBaseTake(snapshot.baseTake);
    setTrackBuffer(snapshot.trackIndex, snapshot.buffer, snapshot.peaks);
    resetLoopIfEmpty();
  }, [forgetUndo, resetLoopIfEmpty, setBaseTake, setTrackBuffer]);

  const togglePlayback = useCallback(() => {
    if (isPlayingRef.current) {
      stopAll();
    } else {
      playAll();
    }
  }, [playAll, stopAll]);

  const getLoopPosition = useCallback((): LoopPosition | null => {
    const engine = engineRef.current;
    const durationS = loopDurationRef.current;
    if (!engine || !durationS || !isPlayingRef.current) return null;

    return {
      positionS: getLoopPositionSeconds(engine.context.currentTime, loopEpochRef.current, durationS),
      durationS,
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const jobs = jobsRef.current;
    const players = playersRef.current;

    return () => {
      isMountedRef.current = false;
      jobs.forEach((job) => job?.timers.forEach((timer) => window.clearTimeout(timer)));
      players.forEach((player) => {
        try {
          player?.stop();
        } catch {
          // Already stopped.
        }
      });

      disposeEngine(engineRef.current);
      engineRef.current = null;

      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
    };
  }, []);

  const loopTrim =
    baseTrim &&
    tracks.every((track, index) =>
      index === baseTrim.trackIndex ? track.status === "playing" : track.status === "empty"
    )
      ? { startMs: baseTrim.startMs, endMs: baseTrim.endMs }
      : null;

  return {
    tracks,
    loopTrim,
    canUndo,
    loopDurationS,
    isPlaying,
    isStarting,
    error,
    latencyNudgeMs,
    setLatencyNudgeMs,
    toggleRecord,
    toggleMute,
    setVolume,
    clearTrack,
    clearAll,
    togglePlayback,
    getLoopPosition,
    setLoopTrim,
    resetLoopTrim,
    undoLastTake,
  };
}
