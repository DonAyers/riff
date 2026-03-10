import { useCallback, useEffect, useRef, useState } from "react";

interface WorkerProgressMessage {
  type: "progress";
  requestId: number;
  progress: number;
}

interface WorkerResultMessage {
  type: "result";
  requestId: number;
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

export interface UsePitchDetectionReturn {
  detect: (audio: Float32Array, options?: DetectOptions) => Promise<DetectedNote[]>;
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
      {
        resolve: (notes: DetectedNote[]) => void;
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
        setProgress(message.progress);
        return;
      }

      if (message.type === "preloadComplete") {
        pendingRef.current.delete(message.requestId);
        (pending.resolve as unknown as () => void)();
        return;
      }

      pendingRef.current.delete(message.requestId);
      setIsLoading(false);

      if (message.type === "error") {
        setError(message.error);
        (pending.resolve as unknown as (r: DetectedNote[]) => void)([]);
        return;
      }

      const mapped: DetectedNote[] = message.notes.map((n) => ({
        pitchMidi: n.pitchMidi,
        startTimeS: n.startTimeSeconds,
        durationS: n.durationSeconds,
        amplitude: n.amplitude,
      }));
      (pending.resolve as unknown as (r: DetectedNote[]) => void)(mapped);
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
    async (audio: Float32Array, options?: DetectOptions): Promise<DetectedNote[]> => {
      if (!workerRef.current) {
        setError("Pitch detection worker is unavailable");
        return [];
      }

      setIsLoading(true);
      setProgress(0);
      setError(null);

      const requestId = ++requestIdRef.current;

      return new Promise<DetectedNote[]>((resolve, reject) => {
        pendingRef.current.set(requestId, { resolve, reject });

        const transferableAudio = audio.slice();
        workerRef.current?.postMessage(
          {
            type: "detect",
            requestId,
            audio: transferableAudio,
            confidenceThreshold: options?.confidenceThreshold,
            onsetThreshold: options?.onsetThreshold,
            maxPolyphony: options?.maxPolyphony,
          },
          [transferableAudio.buffer]
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
        resolve: resolve as unknown as (notes: DetectedNote[]) => void,
        reject
      });
      workerRef.current?.postMessage({ type: "preload", requestId });
    });
  }, []);

  return { detect, preload, isLoading, progress, error };
}
