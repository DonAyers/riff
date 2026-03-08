import { useCallback, useRef, useState } from "react";

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
  const chunksRef = useRef<Float32Array[]>([]);

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

      const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      audioContextRef.current = audioContext;

      // Use a ScriptProcessor as a fallback-friendly way to capture raw PCM.
      // AudioWorklet is preferred in production but ScriptProcessor is simpler
      // to scaffold and works in all browsers today.
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(input));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      workletNodeRef.current = processor as unknown as AudioWorkletNode;
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
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
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
    return merged;
  }, []);

  return { state, startRecording, stopRecording, error };
}
