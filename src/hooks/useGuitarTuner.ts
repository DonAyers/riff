import { useCallback, useRef, useState } from "react";
import {
  createTuningStabilizer,
  detectPitchYin,
  getTuningReading,
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
}

const ANALYSER_FFT_SIZE = 8192;
const TUNER_MAX_FREQUENCY_HZ = 720;
const TUNER_MIC_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 1 },
} satisfies MediaTrackConstraints;
type AudioFloatBuffer = Parameters<AnalyserNode["getFloatTimeDomainData"]>[0];

export function useGuitarTuner(): UseGuitarTunerReturn {
  const [state, setState] = useState<GuitarTunerState>("idle");
  const [reading, setReading] = useState<TuningReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const samplesRef = useRef<AudioFloatBuffer | null>(null);
  const stabilizerRef = useRef<TuningStabilizer | null>(null);

  if (!stabilizerRef.current) {
    stabilizerRef.current = createTuningStabilizer();
  }

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
    stabilizerRef.current?.reset();
    setState("idle");
  }, []);

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
    }

    analyser.getFloatTimeDomainData(samples);
    const estimate = detectPitchYin(samples, audioContext.sampleRate, {
      maxFrequencyHz: TUNER_MAX_FREQUENCY_HZ,
    });
    const rawReading = estimate ? getTuningReading(estimate) : null;
    setReading(stabilizerRef.current?.update(rawReading, timestampMs) ?? null);

    frameRef.current = requestAnimationFrame(analyzeFrame);
  }, []);

  const start = useCallback(async () => {
    if (state === "listening") {
      return;
    }

    try {
      setError(null);
      setReading(null);
      stabilizerRef.current?.reset();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: TUNER_MIC_CONSTRAINTS,
      });
      const audioContext = new AudioContext();
      if (audioContext.state === "suspended") {
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
      frameRef.current = requestAnimationFrame(analyzeFrame);
    } catch (err) {
      stop();
      const message = err instanceof Error ? err.message : "Unable to start the guitar tuner.";
      setError(message);
    }
  }, [analyzeFrame, state, stop]);

  return {
    state,
    reading,
    error,
    start,
    stop,
  };
}
