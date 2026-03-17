import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAudioRecorder } from "./useAudioRecorder";
import type { PreparedAudio } from "../lib/audioData";

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

    let recordedAudio!:
      | {
          analysisAudio: Float32Array;
          storedAudio: Float32Array;
          storedSampleRate: number;
        }
      | null;
    await act(async () => {
      recordedAudio = await result.current.stopRecording();
    });

    expect(recordedAudio).toEqual({
      analysisAudio: new Float32Array([0.1, 0.2, 0.3]),
      storedAudio: new Float32Array([0.1, 0.2, 0.3]),
      storedSampleRate: 22050,
    });
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(scriptProcessorDisconnect).toHaveBeenCalledTimes(1);
    expect(sourceDisconnect).toHaveBeenCalledTimes(1);
    expect(gainDisconnect).toHaveBeenCalledTimes(1);
  });

  it("preserves native-rate audio separately from analysis audio", async () => {
    const stopTrack = vi.fn();
    const stream: MockStream = {
      getTracks: () => [{ stop: stopTrack }],
    };
    getUserMedia.mockResolvedValue(stream);

    const scriptProcessorNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
    } as unknown as ScriptProcessorNode;

    const renderedAudio = new Float32Array([0.4, 0.3]);

    vi.stubGlobal(
      "OfflineAudioContext",
      function MockOfflineAudioContext(this: Record<string, unknown>) {
        this.createBuffer = vi.fn().mockImplementation((_channels: number, length: number, sampleRate: number) => {
          const channelData = new Float32Array(length);
          return {
            getChannelData: () => channelData,
            length,
            sampleRate,
          } as unknown as AudioBuffer;
        });
        this.createBufferSource = vi.fn().mockReturnValue({
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
        });
        this.destination = {};
        this.startRendering = vi.fn().mockResolvedValue({
          getChannelData: () => renderedAudio,
        } as unknown as AudioBuffer);
      },
    );

    const audioContext = {
      sampleRate: 48000,
      state: "running",
      destination: {},
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
      resume: vi.fn().mockResolvedValue(undefined),
      suspend: vi.fn().mockResolvedValue(undefined),
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { value: 1 },
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
      createScriptProcessor: vi.fn(() => scriptProcessorNode),
    };

    function MockAudioContext() {
      return audioContext;
    }

    function MockAudioWorkletNode() {
      throw new Error("worklet unavailable");
    }

    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("AudioWorkletNode", MockAudioWorkletNode);

    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.startRecording();
    });

    await act(async () => {
      scriptProcessorNode.onaudioprocess?.({
        inputBuffer: makeAudioBuffer(new Float32Array([0.1, 0.2, 0.3, 0.4])),
        outputBuffer: makeAudioBuffer(new Float32Array(4)),
      } as AudioProcessingEvent);
    });

    let recordedAudio!: PreparedAudio | null;
    await act(async () => {
      recordedAudio = await result.current.stopRecording();
    });

    if (!recordedAudio) {
      throw new Error("expected recorded audio");
    }

    expect(recordedAudio).toEqual({
      analysisAudio: renderedAudio,
      storedAudio: new Float32Array([0.1, 0.2, 0.3, 0.4]),
      storedSampleRate: 48000,
    });
    expect(recordedAudio.analysisAudio).not.toBe(recordedAudio.storedAudio);
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });
});
