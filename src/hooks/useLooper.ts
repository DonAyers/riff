import { useCallback, useEffect, useRef, useState } from "react";
import looperCaptureWorkletUrl from "../worklets/looper-capture.worklet?worker&url";
import {
  applyEdgeFades,
  clampLatencyNudgeMs,
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
  pruneChunks,
  type CaptureChunk,
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

export interface UseLooperReturn {
  tracks: LooperTrackState[];
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
}

type RecordJob =
  | { kind: "first"; startFrame: number; timers: number[] }
  | { kind: "overdub"; startFrame: number; timers: number[] };

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

          captureNode.port.onmessage = (event: MessageEvent<CaptureChunk>) => {
            const activeJobs = jobsRef.current.filter((job): job is RecordJob => job !== null);
            if (activeJobs.length === 0) {
              chunksRef.current = [];
              return;
            }

            const keepFrom = Math.min(...activeJobs.map((job) => job.startFrame));
            chunksRef.current = pruneChunks([...chunksRef.current, event.data], keepFrom);
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

  const stopPlayer = useCallback((index: number) => {
    const player = playersRef.current[index];
    playersRef.current[index] = null;
    if (player) {
      player.onended = null;
      try {
        player.stop();
      } catch {
        // Already stopped.
      }
      player.disconnect();
    }
  }, []);

  /** Starts a track's loop so its position matches the shared loop clock. */
  const startPlayer = useCallback((index: number, whenS?: number) => {
    const engine = engineRef.current;
    const buffer = buffersRef.current[index];
    const durationS = loopDurationRef.current;
    if (!engine || !buffer || !durationS) return;

    stopPlayer(index);
    const player = engine.context.createBufferSource();
    player.buffer = buffer;
    player.loop = true;
    player.connect(engine.trackGains[index]);

    const startAtS = whenS ?? engine.context.currentTime + START_LOOKAHEAD_S;
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

  const commitTake = useCallback((index: number, fromFrame: number, lengthFrames: number) => {
    const engine = engineRef.current;
    if (!engine) return;

    const samples = extractFrames(chunksRef.current, fromFrame, lengthFrames);
    applyEdgeFades(samples, EDGE_FADE_SECONDS * engine.context.sampleRate);
    // Match the context rate exactly so looping never resamples or drifts.
    const buffer = engine.context.createBuffer(1, samples.length, engine.context.sampleRate);
    buffer.copyToChannel(samples, 0);
    buffersRef.current[index] = buffer;
    clearJob(index);

    updateTrack(index, { status: "playing", peaks: computePeaks(samples, PEAK_BINS) });
    startPlayer(index);
  }, [clearJob, startPlayer, updateTrack]);

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

    whenCaptured(index, stopFrame, () => commitTake(index, job.startFrame, lengthFrames));
  }, [clearJob, commitTake, updateTrack, whenCaptured]);

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
    resetLoopIfEmpty();
  }, [clearJob, resetLoopIfEmpty, stopPlayer, updateTrack]);

  const clearAll = useCallback(() => {
    for (let index = 0; index < LOOPER_TRACK_COUNT; index += 1) {
      clearJob(index);
      stopPlayer(index);
      buffersRef.current[index] = null;
    }
    setTracks((current) => current.map((track) => ({ ...track, status: "empty", peaks: [] })));
    resetLoopIfEmpty();
  }, [clearJob, resetLoopIfEmpty, stopPlayer]);

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

  return {
    tracks,
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
  };
}
