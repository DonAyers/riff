import { useCallback, useEffect, useRef, useState } from "react";

const PROGRESS_UPDATE_INTERVAL_MS = 100;
const MAX_WORKER_RECOVERY_ATTEMPTS = 1;
const WORKER_RECOVERY_ERROR_MESSAGE = "Pitch detection was interrupted. Please try again.";

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
  const isUnmountingRef = useRef(false);
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayedProgressRef = useRef(0);
  const pendingProgressRef = useRef<number | null>(null);
  const lastProgressCommitAtRef = useRef(0);

  interface PendingDetectRequest {
    type: "detect";
    resolve: (result: DetectResult) => void;
    reject: (reason?: unknown) => void;
    options?: DetectOptions;
    sourceAudio: Float32Array;
    recoveryAttempts: number;
  }

  interface PendingPreloadRequest {
    type: "preload";
    resolve: () => void;
    reject: (reason?: unknown) => void;
  }

  type PendingRequest = PendingDetectRequest | PendingPreloadRequest;

  const pendingRef = useRef<Map<number, PendingRequest>>(new Map());

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

  const hasPendingDetectRequests = useCallback(() => {
    for (const pending of pendingRef.current.values()) {
      if (pending.type === "detect") {
        return true;
      }
    }
    return false;
  }, []);

  useEffect(() => {
    const postDetectRequest = (
      worker: Worker,
      requestId: number,
      pending: PendingDetectRequest,
      audio: Float32Array
    ) => {
      worker.postMessage(
        {
          type: "detect",
          requestId,
          audio,
          confidenceThreshold: pending.options?.confidenceThreshold,
          onsetThreshold: pending.options?.onsetThreshold,
          maxPolyphony: pending.options?.maxPolyphony,
        },
        [audio.buffer]
      );
    };

    const createWorker = (): Worker => {
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
            setIsLoading(hasPendingDetectRequests());
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
        setIsLoading(hasPendingDetectRequests());
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

      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault?.();
        if (isUnmountingRef.current) {
          return;
        }

        clearProgressTimer();

        const nextWorker = createWorker();
        const previousWorker = workerRef.current;
        previousWorker?.terminate();
        workerRef.current = nextWorker;

        let retriedDetectRequest = false;

        for (const [requestId, pending] of pendingRef.current.entries()) {
          if (pending.type === "preload") {
            pendingRef.current.delete(requestId);
            pending.reject(new Error(WORKER_RECOVERY_ERROR_MESSAGE));
            continue;
          }

          if (pending.recoveryAttempts >= MAX_WORKER_RECOVERY_ATTEMPTS) {
            pendingRef.current.delete(requestId);
            pending.reject(
              new PitchDetectionError(WORKER_RECOVERY_ERROR_MESSAGE, pending.sourceAudio.slice())
            );
            continue;
          }

          pending.recoveryAttempts += 1;
          retriedDetectRequest = true;
          const retryAudio = pending.sourceAudio.slice();

          try {
            postDetectRequest(nextWorker, requestId, pending, retryAudio);
          } catch {
            pendingRef.current.delete(requestId);
            pending.reject(
              new PitchDetectionError(WORKER_RECOVERY_ERROR_MESSAGE, pending.sourceAudio.slice())
            );
          }
        }

        if (retriedDetectRequest) {
          resetProgress();
          setIsLoading(true);
          setError(null);
          return;
        }

        setIsLoading(false);
        setError(WORKER_RECOVERY_ERROR_MESSAGE);
      };

      return worker;
    };

    isUnmountingRef.current = false;
    workerRef.current = createWorker();

    return () => {
      isUnmountingRef.current = true;
      clearProgressTimer();
      for (const pending of pendingRef.current.values()) {
        pending.reject(new Error("Pitch detection worker terminated"));
      }
      pendingRef.current.clear();
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [clearProgressTimer, commitProgress, hasPendingDetectRequests, queueProgressUpdate, resetProgress]);

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
      const sourceAudio = audio.slice();

      return new Promise<DetectResult>((resolve, reject) => {
        pendingRef.current.set(requestId, {
          type: "detect",
          resolve,
          reject,
          options,
          sourceAudio,
          recoveryAttempts: 0,
        });

        const worker = workerRef.current;
        if (!worker) {
          pendingRef.current.delete(requestId);
          const unavailableError = new PitchDetectionError(
            "Pitch detection worker is unavailable",
            sourceAudio
          );
          setIsLoading(false);
          setError(unavailableError.message);
          reject(unavailableError);
          return;
        }

        try {
          worker.postMessage(
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
        } catch (postError) {
          pendingRef.current.delete(requestId);
          const workerError =
            postError instanceof Error ? postError.message : WORKER_RECOVERY_ERROR_MESSAGE;
          setIsLoading(false);
          setError(workerError);
          reject(new PitchDetectionError(workerError, sourceAudio));
        }
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
