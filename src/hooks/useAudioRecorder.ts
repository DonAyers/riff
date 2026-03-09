import { useCallback, useRef, useState } from "react";
import audioCaptureWorkletUrl from "../worklets/audio-capture.worklet?url";

export type RecorderState = "idle" | "recording" | "processing";

export interface UseAudioRecorderReturn {
  state: RecorderState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<Float32Array | null>;
  error: string | null;
}

const TARGET_SAMPLE_RATE = 22050;

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(TARGET_SAMPLE_RATE);

  const ensureAudioContext = useCallback(async (): Promise<AudioContext> => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      await audioContextRef.current.audioWorklet.addModule(audioCaptureWorkletUrl);
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const resampleToTarget = useCallback(
    async (pcm: Float32Array, inputSampleRate: number): Promise<Float32Array> => {
      if (inputSampleRate === TARGET_SAMPLE_RATE) {
        return pcm;
      }

      const frameCount = Math.ceil(
        (pcm.length * TARGET_SAMPLE_RATE) / inputSampleRate
      );
      const offlineContext = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
      const buffer = offlineContext.createBuffer(1, pcm.length, inputSampleRate);
      buffer.getChannelData(0).set(pcm);

      const source = offlineContext.createBufferSource();
      source.buffer = buffer;
      source.connect(offlineContext.destination);
      source.start();

      const rendered = await offlineContext.startRendering();
      return rendered.getChannelData(0).slice();
    },
    []
  );

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const audioContext = await ensureAudioContext();
      sampleRateRef.current = audioContext.sampleRate;

      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      workletNodeRef.current = workletNode;

      const muteGain = audioContext.createGain();
      muteGain.gain.value = 0;
      muteGainRef.current = muteGain;

      workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
        chunksRef.current.push(event.data);
      };

      source.connect(workletNode);
      workletNode.connect(muteGain);
      muteGain.connect(audioContext.destination);

      setState("recording");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      setError(message);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<Float32Array | null> => {
    setState("processing");

    // Stop all tracks and disconnect audio nodes
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (muteGainRef.current) {
      muteGainRef.current.disconnect();
      muteGainRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.suspend();
    }

    // Merge captured chunks into a single Float32Array
    const chunks = chunksRef.current;
    if (chunks.length === 0) {
      setState("idle");
      return null;
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    chunksRef.current = [];
    setState("idle");

    return resampleToTarget(merged, sampleRateRef.current);
  }, [resampleToTarget]);

  return { state, startRecording, stopRecording, error };
}
