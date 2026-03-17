import { useCallback, useRef, useState } from "react";
import audioCaptureWorkletUrl from "../worklets/audio-capture.worklet?url";
import { ANALYSIS_SAMPLE_RATE, type PreparedAudio } from "../lib/audioData";

export type RecorderState = "idle" | "recording" | "processing";

export interface UseAudioRecorderReturn {
  state: RecorderState;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<PreparedAudio | null>;
  error: string | null;
}

const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;
type CaptureNode = AudioWorkletNode | ScriptProcessorNode;
type CaptureBackend = "worklet" | "script-processor";

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureNodeRef = useRef<CaptureNode | null>(null);
  const captureBackendRef = useRef<CaptureBackend | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(ANALYSIS_SAMPLE_RATE);
  const workletModuleLoadedRef = useRef(false);

  const ensureAudioContext = useCallback(async (): Promise<AudioContext> => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const stopActiveStream = useCallback(() => {
    if (!streamRef.current) {
      return;
    }

    streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const disconnectCaptureGraph = useCallback(() => {
    const captureNode = captureNodeRef.current;
    const captureBackend = captureBackendRef.current;

    if (captureNode) {
      if (captureBackend === "worklet") {
        (captureNode as AudioWorkletNode).port.onmessage = null;
      } else if (captureBackend === "script-processor") {
        (captureNode as ScriptProcessorNode).onaudioprocess = null;
      }

      captureNode.disconnect();
      captureNodeRef.current = null;
      captureBackendRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (muteGainRef.current) {
      muteGainRef.current.disconnect();
      muteGainRef.current = null;
    }
  }, []);

  const ensureWorkletModule = useCallback(async (audioContext: AudioContext) => {
    if (workletModuleLoadedRef.current) {
      return;
    }

    if (!audioContext.audioWorklet) {
      throw new Error("AudioWorklet is unavailable in this browser.");
    }

    await audioContext.audioWorklet.addModule(audioCaptureWorkletUrl);
    workletModuleLoadedRef.current = true;
  }, []);

  const createCaptureNode = useCallback(
    async (audioContext: AudioContext): Promise<{ node: CaptureNode; backend: CaptureBackend }> => {
      let workletError: unknown;

      if (audioContext.audioWorklet && typeof AudioWorkletNode !== "undefined") {
        try {
          await ensureWorkletModule(audioContext);

          const workletNode = new AudioWorkletNode(audioContext, "audio-capture-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
          });

          workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
            chunksRef.current.push(event.data);
          };

          return { node: workletNode, backend: "worklet" };
        } catch (error) {
          workletError = error;
        }
      }

      if (typeof audioContext.createScriptProcessor === "function") {
        const scriptProcessor = audioContext.createScriptProcessor(
          SCRIPT_PROCESSOR_BUFFER_SIZE,
          1,
          1
        );

        scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
          if (event.inputBuffer.numberOfChannels === 0) {
            return;
          }

          const inputChannel = event.inputBuffer.getChannelData(0);
          chunksRef.current.push(new Float32Array(inputChannel));

          if (event.outputBuffer.numberOfChannels > 0) {
            event.outputBuffer.getChannelData(0).set(inputChannel);
          }
        };

        return { node: scriptProcessor, backend: "script-processor" };
      }

      if (workletError instanceof Error) {
        throw workletError;
      }

      throw new Error("Audio capture is not supported in this browser.");
    },
    [ensureWorkletModule]
  );

  const resampleToTarget = useCallback(
    async (pcm: Float32Array, inputSampleRate: number): Promise<Float32Array> => {
      if (inputSampleRate === ANALYSIS_SAMPLE_RATE) {
        return pcm.slice();
      }

      const frameCount = Math.ceil(
        (pcm.length * ANALYSIS_SAMPLE_RATE) / inputSampleRate
      );
      const offlineContext = new OfflineAudioContext(1, frameCount, ANALYSIS_SAMPLE_RATE);
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

      const { node: captureNode, backend } = await createCaptureNode(audioContext);
      captureNodeRef.current = captureNode;
      captureBackendRef.current = backend;

      const muteGain = audioContext.createGain();
      muteGain.gain.value = 0;
      muteGainRef.current = muteGain;

      source.connect(captureNode);
      captureNode.connect(muteGain);
      muteGain.connect(audioContext.destination);

      setState("recording");
    } catch (err) {
      disconnectCaptureGraph();
      stopActiveStream();

      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      setError(message);
    }
  }, [createCaptureNode, disconnectCaptureGraph, ensureAudioContext, stopActiveStream]);

  const stopRecording = useCallback(async (): Promise<PreparedAudio | null> => {
    setState("processing");

    // Stop all tracks and disconnect audio nodes
    stopActiveStream();
    disconnectCaptureGraph();

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
    const storedSampleRate = sampleRateRef.current;
    const analysisAudio = await resampleToTarget(merged, storedSampleRate);
    setState("idle");

    return {
      analysisAudio,
      storedAudio: merged,
      storedSampleRate,
    };
  }, [disconnectCaptureGraph, resampleToTarget, stopActiveStream]);

  return { state, startRecording, stopRecording, error };
}
