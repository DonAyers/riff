import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePitchDetection } from "./usePitchDetection";

type WorkerListener = ((event: MessageEvent<unknown>) => void) | null;

class MockWorker {
  static instances: MockWorker[] = [];

  public onmessage: WorkerListener = null;
  public terminated = false;
  public postMessage = vi.fn();

  constructor() {
    MockWorker.instances.push(this);
  }

  terminate() {
    this.terminated = true;
  }

  emit(message: unknown) {
    this.onmessage?.({ data: message } as MessageEvent<unknown>);
  }
}

describe("usePitchDetection", () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal("Worker", MockWorker as unknown as typeof Worker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps worker note results into detected notes", async () => {
    const { result } = renderHook(() => usePitchDetection());
    const worker = MockWorker.instances[0];

    let detectedNotes = undefined as unknown as Awaited<ReturnType<typeof result.current.detect>>;
    await act(async () => {
      const pending = result.current.detect(new Float32Array([0.1, 0.2]));
      worker.emit({
        type: "result",
        requestId: 1,
        audioBuffer: new Float32Array([0.1, 0.2]).buffer,
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

  it("rejects detect when the worker reports an error", async () => {
    const { result } = renderHook(() => usePitchDetection());
    const worker = MockWorker.instances[0];

    let thrown: unknown;
    await act(async () => {
      const pending = result.current.detect(new Float32Array([0.1, 0.2]));
      worker.emit({
        type: "error",
        requestId: 1,
        error: "Pitch model failed",
        audioBuffer: new Float32Array([0.1, 0.2]).buffer,
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
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Pitch model failed");
    expect(result.current.error).toBe("Pitch model failed");
    expect((thrown as { audio: Float32Array }).audio).toEqual(new Float32Array([0.1, 0.2]));
  });
});