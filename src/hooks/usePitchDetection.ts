import { useCallback, useEffect, useRef, useState } from "react";

interface WorkerProgressMessage {
  type: "progress";
  requestId: number;
  progress: number;
}

interface WorkerResultMessage {
  type: "result";
  requestId: number;
  audioBuffer: ArrayBuffer;
  notes: {
    pitchMidi: number;
    startTimeSeconds: number;
    durationSeconds: number;
    amplitude: number;
  }[];
}

interface WorkerErrorMessage {
  type: "error";
  requestId: number;
  error: string;
  audioBuffer?: ArrayBuffer;
}

interface WorkerPreloadCompleteMessage {
  type: "preloadComplete";
  requestId: number;
}

type WorkerMessage =
  | WorkerProgressMessage
  | WorkerResultMessage
  | WorkerErrorMessage
  | WorkerPreloadCompleteMessage;

export interface DetectedNote {
  pitchMidi: number;
  startTimeS: number;
  durationS: number;
  amplitude: number;
}

export interface DetectOptions {
  confidenceThreshold?: number;
  onsetThreshold?: number;
  maxPolyphony?: number;
}

export interface DetectResult {
  notes: DetectedNote[];
  audio: Float32Array;
}

export class PitchDetectionError extends Error {
  audio: Float32Array | null;

  constructor(message: string, audio: Float32Array | null = null) {
    super(message);
    this.name = "PitchDetectionError";
    this.audio = audio;
  }
}

export interface UsePitchDetectionReturn {
  detect: (audio: Float32Array, options?: DetectOptions) => Promise<DetectResult>;
  preload: () => Promise<void>;
  isLoading: boolean;
  progress: number;
  error: string | null;
}

export function usePitchDetection(): UsePitchDetectionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<
    Map<
      number,
      | {
          type: "detect";
          resolve: (result: DetectResult) => void;
          reject: (reason?: unknown) => void;
        }
      | {
          type: "preload";
          resolve: () => void;
          reject: (reason?: unknown) => void;
        }
    >
  >(new Map());

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/pitchDetection.worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      const pending = pendingRef.current.get(message.requestId);
      if (!pending) {
        return;
      }

      if (message.type === "progress") {
        if (pending.type === "detect") {
          setProgress(message.progress);
        }
        return;
      }

      if (message.type === "preloadComplete") {
        pendingRef.current.delete(message.requestId);
        if (pending.type === "preload") {
          pending.resolve();
        }
        return;
      }

      pendingRef.current.delete(message.requestId);

      if (message.type === "error") {
        setError(message.error);
        if (pending.type === "detect") {
          setIsLoading(false);
        }
        const restoredAudio = message.audioBuffer ? new Float32Array(message.audioBuffer) : null;
        pending.reject(new PitchDetectionError(message.error, restoredAudio));
        return;
      }

      if (pending.type !== "detect") {
        pending.reject(new Error("Received detect result for non-detect request"));
        return;
      }

      setIsLoading(false);
      const mapped: DetectedNote[] = message.notes.map((n) => ({
        pitchMidi: n.pitchMidi,
        startTimeS: n.startTimeSeconds,
        durationS: n.durationSeconds,
        amplitude: n.amplitude,
      }));
      pending.resolve({
        notes: mapped,
        audio: new Float32Array(message.audioBuffer),
      });
    };

    workerRef.current = worker;

    return () => {
      for (const pending of pendingRef.current.values()) {
        pending.reject(new Error("Pitch detection worker terminated"));
      }
      pendingRef.current.clear();
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const detect = useCallback(
    async (audio: Float32Array, options?: DetectOptions): Promise<DetectResult> => {
      if (!workerRef.current) {
        const unavailableError = new Error("Pitch detection worker is unavailable");
        setError(unavailableError.message);
        return Promise.reject(unavailableError);
      }

      setIsLoading(true);
      setProgress(0);
      setError(null);

      const requestId = ++requestIdRef.current;

      return new Promise<DetectResult>((resolve, reject) => {
        pendingRef.current.set(requestId, { type: "detect", resolve, reject });

        workerRef.current?.postMessage(
          {
            type: "detect",
            requestId,
            audio,
            confidenceThreshold: options?.confidenceThreshold,
            onsetThreshold: options?.onsetThreshold,
            maxPolyphony: options?.maxPolyphony,
          },
          [audio.buffer]
        );
      });
    },
    []
  );

  const preload = useCallback(async (): Promise<void> => {
    if (!workerRef.current) return;

    const requestId = ++requestIdRef.current;
    return new Promise<void>((resolve, reject) => {
      pendingRef.current.set(requestId, {
        type: "preload",
        resolve,
        reject,
      });
      workerRef.current?.postMessage({ type: "preload", requestId });
    });
  }, []);

  return { detect, preload, isLoading, progress, error };
}
