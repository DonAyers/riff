import { useCallback, useEffect, useRef, useState } from "react";

const PROGRESS_UPDATE_INTERVAL_MS = 100;

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
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedProgressRef = useRef(0);
  const pendingProgressRef = useRef<number | null>(null);
  const lastProgressCommitAtRef = useRef(0);
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

  const clearProgressTimer = useCallback(() => {
    if (progressTimeoutRef.current !== null) {
      clearTimeout(progressTimeoutRef.current);
      progressTimeoutRef.current = null;
    }
  }, []);

  const commitProgress = useCallback(
    (nextProgress: number) => {
      clearProgressTimer();
      pendingProgressRef.current = null;
      displayedProgressRef.current = nextProgress;
      lastProgressCommitAtRef.current = Date.now();
      setProgress(nextProgress);
    },
    [clearProgressTimer]
  );

  const resetProgress = useCallback(() => {
    clearProgressTimer();
    displayedProgressRef.current = 0;
    pendingProgressRef.current = null;
    lastProgressCommitAtRef.current = 0;
    setProgress(0);
  }, [clearProgressTimer]);

  const queueProgressUpdate = useCallback(
    (nextProgress: number) => {
      const normalizedProgress = Math.min(100, Math.max(0, Math.round(nextProgress)));
      const queuedProgress = Math.max(
        normalizedProgress,
        pendingProgressRef.current ?? displayedProgressRef.current
      );

      if (queuedProgress <= displayedProgressRef.current) {
        return;
      }

      pendingProgressRef.current = queuedProgress;

      const elapsed = Date.now() - lastProgressCommitAtRef.current;
      if (elapsed >= PROGRESS_UPDATE_INTERVAL_MS || queuedProgress === 100) {
        commitProgress(queuedProgress);
        return;
      }

      if (progressTimeoutRef.current !== null) {
        return;
      }

      progressTimeoutRef.current = setTimeout(() => {
        const bufferedProgress = pendingProgressRef.current;
        if (bufferedProgress !== null && bufferedProgress > displayedProgressRef.current) {
          commitProgress(bufferedProgress);
          return;
        }

        clearProgressTimer();
      }, PROGRESS_UPDATE_INTERVAL_MS - elapsed);
    },
    [clearProgressTimer, commitProgress]
  );

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
          queueProgressUpdate(message.progress);
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
        if (pending.type === "detect") {
          clearProgressTimer();
          setIsLoading(false);
          setError(message.error);
        }
        const restoredAudio = message.audioBuffer ? new Float32Array(message.audioBuffer) : null;
        pending.reject(new PitchDetectionError(message.error, restoredAudio));
        return;
      }

      if (pending.type !== "detect") {
        pending.reject(new Error("Received detect result for non-detect request"));
        return;
      }

      commitProgress(100);
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
      clearProgressTimer();
      for (const pending of pendingRef.current.values()) {
        pending.reject(new Error("Pitch detection worker terminated"));
      }
      pendingRef.current.clear();
      worker.terminate();
      workerRef.current = null;
    };
  }, [clearProgressTimer, commitProgress, queueProgressUpdate]);

  const detect = useCallback(
    async (audio: Float32Array, options?: DetectOptions): Promise<DetectResult> => {
      if (!workerRef.current) {
        const unavailableError = new Error("Pitch detection worker is unavailable");
        setError(unavailableError.message);
        return Promise.reject(unavailableError);
      }

      setIsLoading(true);
      resetProgress();
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
    [resetProgress]
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
