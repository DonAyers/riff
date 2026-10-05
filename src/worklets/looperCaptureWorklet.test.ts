import { beforeAll, describe, expect, it, vi } from "vitest";

type ProcessorInstance = {
  port: { postMessage: ReturnType<typeof vi.fn> };
  process: (inputs: Float32Array[][]) => boolean;
};

let Processor: new () => ProcessorInstance;
let frame = 0;

beforeAll(async () => {
  // Stand-ins for the AudioWorkletGlobalScope the processor runs in.
  vi.stubGlobal(
    "AudioWorkletProcessor",
    class {
      port = { postMessage: vi.fn() };
    }
  );
  vi.stubGlobal("registerProcessor", (_name: string, ctor: new () => ProcessorInstance) => {
    Processor = ctor;
  });
  Object.defineProperty(globalThis, "currentFrame", { get: () => frame, configurable: true });
  await import("./looper-capture.worklet");
});

function quantum(startValue: number): Float32Array[][] {
  return [[Float32Array.from({ length: 128 }, (_, i) => startValue + i)]];
}

function render(processor: ProcessorInstance, startFrame: number, quanta: number) {
  for (let q = 0; q < quanta; q += 1) {
    frame = startFrame + q * 128;
    processor.process(quantum(frame));
  }
}

describe("looper capture worklet", () => {
  it("posts 2048-frame batches stamped with the frame of their first sample", () => {
    const processor = new Processor();
    render(processor, 1000, 32);

    const messages = processor.port.postMessage.mock.calls.map(([message]) => message);
    expect(messages).toHaveLength(2);
    expect(messages[0].startFrame).toBe(1000);
    expect(messages[0].samples).toHaveLength(2048);
    expect(messages[0].samples[0]).toBe(1000);
    expect(messages[1].startFrame).toBe(1000 + 2048);
    expect(messages[1].samples[2047]).toBe(1000 + 4095);
  });

  it("flushes a partial batch and restarts the stamp when a quantum is dropped", () => {
    const processor = new Processor();
    render(processor, 0, 3);
    render(processor, 128 * 5, 16);

    const messages = processor.port.postMessage.mock.calls.map(([message]) => message);
    expect(messages[0].startFrame).toBe(0);
    expect(messages[0].samples).toHaveLength(384);
    expect(messages[1].startFrame).toBe(640);
    expect(messages[1].samples[0]).toBe(640);
  });

  it("keeps running when the input has no channels yet", () => {
    const processor = new Processor();
    expect(processor.process([[]])).toBe(true);
    expect(processor.port.postMessage).not.toHaveBeenCalled();
  });
});
