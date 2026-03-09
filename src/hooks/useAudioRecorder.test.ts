import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioRecorder } from "./useAudioRecorder";

vi.mock("../worklets/audio-capture.worklet?url", () => ({
  default: "/mock-audio-capture.worklet.js",
}));

type MockTrack = { stop: ReturnType<typeof vi.fn> };
type MockStream = { getTracks: () => MockTrack[] };

function makeAudioBuffer(channelData: Float32Array): AudioBuffer {
  return {
    numberOfChannels: 1,
    getChannelData: vi.fn(() => channelData),
  } as unknown as AudioBuffer;
}

describe("useAudioRecorder", () => {
  const getUserMedia = vi.fn<() => Promise<MockStream>>();

  beforeEach(() => {
    vi.restoreAllMocks();
    getUserMedia.mockReset();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to ScriptProcessor when AudioWorklet setup fails", async () => {
    const stopTrack = vi.fn();
    const stream: MockStream = {
      getTracks: () => [{ stop: stopTrack }],
    };
    getUserMedia.mockResolvedValue(stream);

    const sourceConnect = vi.fn();
    const sourceDisconnect = vi.fn();
    const gainConnect = vi.fn();
    const gainDisconnect = vi.fn();
    const scriptProcessorConnect = vi.fn();
    const scriptProcessorDisconnect = vi.fn();

    const scriptProcessorNode = {
      connect: scriptProcessorConnect,
      disconnect: scriptProcessorDisconnect,
      onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
    } as unknown as ScriptProcessorNode;

    const audioContext = {
      sampleRate: 22050,
      state: "running",
      destination: {},
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      createMediaStreamSource: vi.fn(() => ({
        connect: sourceConnect,
        disconnect: sourceDisconnect,
      })),
      createGain: vi.fn(() => ({
        gain: { value: 1 },
        connect: gainConnect,
        disconnect: gainDisconnect,
      })),
      createScriptProcessor: vi.fn(() => scriptProcessorNode),
    };

    function MockAudioContext() {
      return audioContext;
    }

    function MockAudioWorkletNode() {
      throw new Error("no ScriptProcessor was registered by this name");
    }

    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("AudioWorkletNode", MockAudioWorkletNode);

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    await waitFor(() => {
      expect(result.current.state).toBe("recording");
    });

    expect(result.current.error).toBeNull();
    expect(audioContext.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
    expect(scriptProcessorNode.onaudioprocess).toBeTypeOf("function");

    await act(async () => {
      scriptProcessorNode.onaudioprocess?.({
        inputBuffer: makeAudioBuffer(new Float32Array([0.1, 0.2, 0.3])),
        outputBuffer: makeAudioBuffer(new Float32Array(3)),
      } as AudioProcessingEvent);
    });

    let recordedAudio: Float32Array | null = null;
    await act(async () => {
      recordedAudio = await result.current.stopRecording();
    });

    expect(recordedAudio).toEqual(new Float32Array([0.1, 0.2, 0.3]));
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(scriptProcessorDisconnect).toHaveBeenCalledTimes(1);
    expect(sourceDisconnect).toHaveBeenCalledTimes(1);
    expect(gainDisconnect).toHaveBeenCalledTimes(1);
  });
});