import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PitchDetectionError, usePitchDetection } from "./usePitchDetection";

type WorkerListener = ((event: MessageEvent<unknown>) => void) | null;
type WorkerErrorListener = ((event: ErrorEvent) => void) | null;

interface DetectRequestMessage {
  type: "detect";
  requestId: number;
  audio: Float32Array;
  confidenceThreshold?: number;
  onsetThreshold?: number;
  maxPolyphony?: number;
}

interface SentWorkerMessage {
  message: DetectRequestMessage | { type: "preload"; requestId: number };
  transfer: Transferable[] | undefined;
}

class MockWorker {
  static instances: MockWorker[] = [];

  public onmessage: WorkerListener = null;
  public onerror: WorkerErrorListener = null;
  public terminated = false;
  public sentMessages: SentWorkerMessage[] = [];
  public postMessage = vi.fn((message: SentWorkerMessage["message"], transfer?: Transferable[]) => {
    const clonedMessage =
      transfer === undefined
        ? structuredClone(message)
        : structuredClone(message, { transfer }) as SentWorkerMessage["message"];

    this.sentMessages.push({
      message: clonedMessage,
      transfer,
    });
  });

  constructor() {
    MockWorker.instances.push(this);
  }

  terminate() {
    this.terminated = true;
  }

  emit(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }

  emitError(message = "Worker crashed") {
    this.onerror?.({
      message,
      preventDefault: vi.fn(),
    } as unknown as ErrorEvent);
  }
}

describe("usePitchDetection", () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker as unknown as typeof Worker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("transfers audio into the worker and restores it on successful detect", async () => {
    const { result } = renderHook(() => usePitchDetection());
    const worker = MockWorker.instances[0];
    const inputAudio = new Float32Array([0.1, 0.2]);

    let pending = undefined as unknown as ReturnType<typeof result.current.detect>;
    act(() => {
      pending = result.current.detect(inputAudio);
    });

    expect(inputAudio.byteLength).toBe(0);

    const request = worker.sentMessages[0]?.message as DetectRequestMessage;
    expect(request.type).toBe("detect");
    expect(request.audio).toHaveLength(2);
    expect(request.audio[0]).toBeCloseTo(0.1);
    expect(request.audio[1]).toBeCloseTo(0.2);

    let detectedNotes = undefined as unknown as Awaited<ReturnType<typeof result.current.detect>>;
    await act(async () => {
      worker.emit({
        type: "result",
        requestId: 1,
        audioBuffer: request.audio.buffer,
        notes: [{ pitchMidi: 64, startTimeSeconds: 0.5, durationSeconds: 0.75, amplitude: 0.7 }],
      });
      detectedNotes = await pending;
    });

    expect(detectedNotes).toEqual({
      notes: [{ pitchMidi: 64, startTimeS: 0.5, durationS: 0.75, amplitude: 0.7 }],
      audio: new Float32Array([0.1, 0.2]),
    });
    expect(result.current.error).toBeNull();
  });

  it("restores transferred audio when the worker reports an error", async () => {
    const { result } = renderHook(() => usePitchDetection());
    const worker = MockWorker.instances[0];
    const inputAudio = new Float32Array([0.1, 0.2]);

    let thrown: unknown;
    await act(async () => {
      const pending = result.current.detect(inputAudio);
      expect(inputAudio.byteLength).toBe(0);

      const request = worker.sentMessages[0]?.message as DetectRequestMessage;
      worker.emit({
        type: "error",
        requestId: 1,
        error: "Pitch model failed",
        audioBuffer: request.audio.buffer,
      });

      try {
        await pending;
      } catch (error) {
        thrown = error;
      }
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(thrown).toBeInstanceOf(PitchDetectionError);
    expect((thrown as Error).message).toBe("Pitch model failed");
    expect(result.current.error).toBe("Pitch model failed");
    expect((thrown as { audio: Float32Array }).audio).toEqual(new Float32Array([0.1, 0.2]));
  });

  it("restarts the worker once and retries an in-flight detect after a worker crash", async () => {
    const { result } = renderHook(() => usePitchDetection());
    const firstWorker = MockWorker.instances[0];

    let pending = undefined as unknown as ReturnType<typeof result.current.detect>;
    act(() => {
      pending = result.current.detect(new Float32Array([0.1, 0.2]));
    });

    act(() => {
      firstWorker.emit({ type: "progress", requestId: 1, progress: 42 });
    });
    expect(result.current.progress).toBe(42);

    act(() => {
      firstWorker.emitError("Worker crashed");
    });

    expect(firstWorker.terminated).toBe(true);
    expect(MockWorker.instances).toHaveLength(2);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();

    const secondWorker = MockWorker.instances[1];
    const retryRequest = secondWorker.sentMessages[0]?.message as DetectRequestMessage;
    expect(retryRequest.audio).toHaveLength(2);
    expect(retryRequest.audio[0]).toBeCloseTo(0.1);
    expect(retryRequest.audio[1]).toBeCloseTo(0.2);

    let detectedNotes = undefined as unknown as Awaited<ReturnType<typeof result.current.detect>>;
    await act(async () => {
      secondWorker.emit({
        type: "result",
        requestId: 1,
        audioBuffer: retryRequest.audio.buffer,
        notes: [],
      });

      detectedNotes = await pending;
    });

    expect(detectedNotes).toEqual({
      notes: [],
      audio: new Float32Array([0.1, 0.2]),
    });
  });

  it("fails after the bounded retry and leaves a fresh worker ready for the next detect", async () => {
    const { result } = renderHook(() => usePitchDetection());
    const firstWorker = MockWorker.instances[0];

    let thrown: unknown;
    await act(async () => {
      const pending = result.current.detect(new Float32Array([0.1, 0.2]));
      firstWorker.emitError("Worker crashed");

      const secondWorker = MockWorker.instances[1];
      secondWorker.emitError("Worker crashed again");

      try {
        await pending;
      } catch (error) {
        thrown = error;
      }
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(thrown).toBeInstanceOf(PitchDetectionError);
    expect((thrown as Error).message).toBe("Pitch detection was interrupted. Please try again.");
    expect((thrown as PitchDetectionError).audio).toEqual(new Float32Array([0.1, 0.2]));
    expect(result.current.error).toBe("Pitch detection was interrupted. Please try again.");
    expect(MockWorker.instances).toHaveLength(3);

    const recoveryWorker = MockWorker.instances[2];
    let recoveredResult = undefined as unknown as Awaited<ReturnType<typeof result.current.detect>>;
    await act(async () => {
      const pending = result.current.detect(new Float32Array([0.3, 0.4]));
      const recoveryRequest = recoveryWorker.sentMessages[0]?.message as DetectRequestMessage;

      recoveryWorker.emit({
        type: "result",
        requestId: 2,
        audioBuffer: recoveryRequest.audio.buffer,
        notes: [],
      });

      recoveredResult = await pending;
    });

    expect(recoveredResult).toEqual({
      notes: [],
      audio: new Float32Array([0.3, 0.4]),
    });
    expect(result.current.error).toBeNull();
  });

  it("throttles progress updates to the latest worker value", async () => {
    vi.useFakeTimers();

    const { result } = renderHook(() => usePitchDetection());
    const worker = MockWorker.instances[0];

    let pendingDetection = undefined as unknown as ReturnType<typeof result.current.detect>;
    let detectedNotes = undefined as unknown as Awaited<ReturnType<typeof result.current.detect>>;
    act(() => {
      pendingDetection = result.current.detect(new Float32Array([0.1, 0.2]));
    });

    act(() => {
      worker.emit({ type: "progress", requestId: 1, progress: 10 });
    });

    expect(result.current.progress).toBe(10);

    act(() => {
      worker.emit({ type: "progress", requestId: 1, progress: 25 });
      worker.emit({ type: "progress", requestId: 1, progress: 40 });
    });

    act(() => {
      vi.advanceTimersByTime(99);
    });
    expect(result.current.progress).toBe(10);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.progress).toBe(40);

    await act(async () => {
      worker.emit({
        type: "result",
        requestId: 1,
        audioBuffer: new Float32Array([0.1, 0.2]).buffer,
        notes: [],
      });

      detectedNotes = await pendingDetection;
    });

    expect(result.current.progress).toBe(100);
    expect(detectedNotes).toEqual({
      notes: [],
      audio: new Float32Array([0.1, 0.2]),
    });
  });
});
