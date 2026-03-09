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

class AudioCaptureProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) {
      return true;
    }

    const channelData = input[0];
    this.port.postMessage(new Float32Array(channelData));

    // Pass through to output; the graph applies gain=0 to avoid audible feedback.
    if (output && output.length > 0) {
      output[0].set(channelData);
    }

    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
