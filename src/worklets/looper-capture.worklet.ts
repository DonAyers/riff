declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void;

/** Frame counter of the audio rendering clock (AudioWorkletGlobalScope.currentFrame). */
declare const currentFrame: number;

// 16 render quanta per message: ~43 ms at 48 kHz, so the main thread gets ~23 messages/s
// instead of ~375 while timing stays exact through the stamped start frame.
const BATCH_FRAMES = 2048;

class LooperCaptureProcessor extends AudioWorkletProcessor {
  private batch = new Float32Array(BATCH_FRAMES);
  private batchStartFrame = -1;
  private writeIndex = 0;

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0];
    if (!channel) {
      return true;
    }

    // A dropped quantum would shift every later sample, so start a fresh batch instead.
    if (this.writeIndex > 0 && currentFrame !== this.batchStartFrame + this.writeIndex) {
      this.flush();
    }

    let read = 0;
    while (read < channel.length) {
      if (this.writeIndex === 0) {
        this.batchStartFrame = currentFrame + read;
      }

      const count = Math.min(channel.length - read, BATCH_FRAMES - this.writeIndex);
      this.batch.set(channel.subarray(read, read + count), this.writeIndex);
      this.writeIndex += count;
      read += count;

      if (this.writeIndex === BATCH_FRAMES) {
        this.flush();
      }
    }

    return true;
  }

  private flush() {
    if (this.writeIndex === 0) {
      return;
    }

    const samples = this.writeIndex === BATCH_FRAMES ? this.batch : this.batch.slice(0, this.writeIndex);
    this.port.postMessage({ startFrame: this.batchStartFrame, samples }, [samples.buffer]);
    this.batch = new Float32Array(BATCH_FRAMES);
    this.writeIndex = 0;
  }
}

registerProcessor("looper-capture-processor", LooperCaptureProcessor);
