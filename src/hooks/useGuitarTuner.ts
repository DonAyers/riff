import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildStringTargets,
  createPitchDetector,
  createTuningStabilizer,
  DEFAULT_A4_HZ,
  DEFAULT_TUNING_ID,
  getTuningPreset,
  getTuningReading,
  MAX_A4_HZ,
  MIN_A4_HZ,
  type GuitarPitchDetector,
  type GuitarStringTarget,
  type TuningPreset,
  type TuningReading,
  type TuningStabilizer,
} from "../lib/guitarTuner";

export type GuitarTunerState = "idle" | "listening";

export interface UseGuitarTunerReturn {
  state: GuitarTunerState;
  reading: TuningReading | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  tuning: TuningPreset;
  setTuningId: (tuningId: string) => void;
  strings: readonly GuitarStringTarget[];
  a4Hz: number;
  setA4Hz: (a4Hz: number) => void;
  lockedStringId: string | null;
  setLockedStringId: (stringId: string | null) => void;
}

// 4096 samples is ~85-93 ms at 48/44.1 kHz: at least 6 periods of a low D (73 Hz), which is
// plenty for MPM while halving latency compared to the previous 8192-sample YIN window.
const ANALYSER_FFT_SIZE = 4096;
const TUNER_MAX_FREQUENCY_HZ = 720;
const TUNING_STORAGE_KEY = "riff:tuner-tuning";
const A4_STORAGE_KEY = "riff:tuner-a4";
type AudioFloatBuffer = Parameters<AnalyserNode["getFloatTimeDomainData"]>[0];
type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

export function getTunerMicConstraints(): MediaTrackConstraints {
  // Browser voice processing is built for speech and smears or gates sustained notes.
  const constraints: MediaTrackConstraints & { voiceIsolation?: boolean } = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 1 },
  };
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() as
    | (MediaTrackSupportedConstraints & { voiceIsolation?: boolean })
    | undefined;

  if (supported?.voiceIsolation) {
    constraints.voiceIsolation = false;
  }

  return constraints;
}

function readStoredValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the setting just will not persist.
  }
}

function clampA4(a4Hz: number): number {
  if (!Number.isFinite(a4Hz)) {
    return DEFAULT_A4_HZ;
  }

  return Math.min(MAX_A4_HZ, Math.max(MIN_A4_HZ, Math.round(a4Hz)));
}

export function useGuitarTuner(): UseGuitarTunerReturn {
  const [state, setState] = useState<GuitarTunerState>("idle");
  const [reading, setReading] = useState<TuningReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tuningId, setTuningIdState] = useState(
    () => readStoredValue(TUNING_STORAGE_KEY) ?? DEFAULT_TUNING_ID
  );
  const [a4Hz, setA4HzState] = useState(() =>
    clampA4(Number(readStoredValue(A4_STORAGE_KEY) ?? DEFAULT_A4_HZ))
  );
  const [lockedStringId, setLockedStringIdState] = useState<string | null>(null);
  const tuning = getTuningPreset(tuningId);
  const strings = useMemo(() => buildStringTargets(tuning, a4Hz), [tuning, a4Hz]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const samplesRef = useRef<AudioFloatBuffer | null>(null);
  const detectorRef = useRef<GuitarPitchDetector | null>(null);
  const stabilizerRef = useRef<TuningStabilizer | null>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const readingOptionsRef = useRef({ strings, a4Hz, lockedStringId });

  useEffect(() => {
    readingOptionsRef.current = { strings, a4Hz, lockedStringId };
  }, [strings, a4Hz, lockedStringId]);

  if (!stabilizerRef.current) {
    stabilizerRef.current = createTuningStabilizer();
  }

  const resetReadings = useCallback(() => {
    stabilizerRef.current?.reset();
    setReading(null);
  }, []);

  const setTuningId = useCallback((nextTuningId: string) => {
    const preset = getTuningPreset(nextTuningId);
    writeStoredValue(TUNING_STORAGE_KEY, preset.id);
    setTuningIdState(preset.id);
    setLockedStringIdState(null);
    resetReadings();
  }, [resetReadings]);

  const setA4Hz = useCallback((nextA4Hz: number) => {
    const clamped = clampA4(nextA4Hz);
    writeStoredValue(A4_STORAGE_KEY, String(clamped));
    setA4HzState(clamped);
    resetReadings();
  }, [resetReadings]);

  const setLockedStringId = useCallback((stringId: string | null) => {
    setLockedStringIdState(stringId);
    resetReadings();
  }, [resetReadings]);

  const requestWakeLock = useCallback(async () => {
    // Keeping the screen on stops mobile browsers from suspending the mic mid-tune.
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLock || wakeLockRef.current) {
      return;
    }

    try {
      wakeLockRef.current = await wakeLock.request("screen");
    } catch {
      wakeLockRef.current = null;
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    void sentinel?.release().catch(() => undefined);
  }, []);

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    samplesRef.current = null;
    detectorRef.current = null;
    releaseWakeLock();
    resetReadings();
    setState("idle");
  }, [releaseWakeLock, resetReadings]);

  const analyzeFrame = useCallback((timestampMs: DOMHighResTimeStamp) => {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;

    if (!analyser || !audioContext) {
      return;
    }

    let samples = samplesRef.current;
    if (!samples || samples.length !== analyser.fftSize) {
      samples = new Float32Array(analyser.fftSize);
      samplesRef.current = samples;
      detectorRef.current = createPitchDetector(analyser.fftSize, {
        maxFrequencyHz: TUNER_MAX_FREQUENCY_HZ,
      });
    }

    analyser.getFloatTimeDomainData(samples);
    const estimate = detectorRef.current?.(samples, audioContext.sampleRate) ?? null;
    const rawReading = estimate ? getTuningReading(estimate, readingOptionsRef.current) : null;
    setReading(stabilizerRef.current?.update(rawReading, timestampMs) ?? null);

    frameRef.current = requestAnimationFrame(analyzeFrame);
  }, []);

  const start = useCallback(async () => {
    if (state === "listening") {
      return;
    }

    try {
      setError(null);
      resetReadings();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getTunerMicConstraints(),
      });
      const audioContext = new AudioContext();
      if (audioContext.state !== "running") {
        await audioContext.resume();
      }

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      analyser.smoothingTimeConstant = 0;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;

      setState("listening");
      void requestWakeLock();
      frameRef.current = requestAnimationFrame(analyzeFrame);
    } catch (err) {
      stop();
      const message = err instanceof Error ? err.message : "Unable to start the guitar tuner.";
      setError(message);
    }
  }, [analyzeFrame, requestWakeLock, resetReadings, state, stop]);

  useEffect(() => {
    if (state !== "listening") {
      return;
    }

    // iOS Safari moves the context to "suspended"/"interrupted" after a call, Siri or a
    // screen lock, and wake locks are dropped whenever the page is hidden.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const audioContext = audioContextRef.current;
      if (audioContext && audioContext.state !== "running") {
        void audioContext.resume().catch(() => undefined);
      }

      wakeLockRef.current = null;
      void requestWakeLock();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [requestWakeLock, state]);

  return {
    state,
    reading,
    error,
    start,
    stop,
    tuning,
    setTuningId,
    strings,
    a4Hz,
    setA4Hz,
    lockedStringId,
    setLockedStringId,
  };
}
