import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRiffSession } from "./useRiffSession";
import { PROFILES } from "../lib/instrumentProfiles";

const {
  mockStartRecording,
  mockStopRecording,
  mockDetect,
  mockPreload,
  mockAudioLoad,
  mockAudioLoadBlob,
  mockAudioReset,
  mockMidiLoad,
  mockMidiStop,
  mockListSessions,
  mockSaveSession,
  mockDeleteSession,
  mockReadPcmFromOpfs,
  mockReadBlobFromOpfs,
  mockDeleteStoredAudio,
  mockDecodeAudioFile,
  mockEncodeCompressed,
  mockSavePcmToOpfs,
  mockSaveBlobToOpfs,
  mockDetectChordTimeline,
  mockDetectChordsWindowed,
  mockDetectKey,
  mockDetectChord,
  mockFormatChordName,
} = vi.hoisted(() => ({
  mockStartRecording: vi.fn(),
  mockStopRecording: vi.fn(),
  mockDetect: vi.fn(),
  mockPreload: vi.fn(),
  mockAudioLoad: vi.fn(),
  mockAudioLoadBlob: vi.fn(),
  mockAudioReset: vi.fn(),
  mockMidiLoad: vi.fn(),
  mockMidiStop: vi.fn(),
  mockListSessions: vi.fn(),
  mockSaveSession: vi.fn(),
  mockDeleteSession: vi.fn(),
  mockReadPcmFromOpfs: vi.fn(),
  mockReadBlobFromOpfs: vi.fn(),
  mockDeleteStoredAudio: vi.fn(),
  mockDecodeAudioFile: vi.fn(),
  mockEncodeCompressed: vi.fn(),
  mockSavePcmToOpfs: vi.fn(),
  mockSaveBlobToOpfs: vi.fn(),
  mockDetectChordTimeline: vi.fn(),
  mockDetectChordsWindowed: vi.fn(),
  mockDetectKey: vi.fn(),
  mockDetectChord: vi.fn(),
  mockFormatChordName: vi.fn(),
}));

vi.mock("./useAudioRecorder", () => ({
  useAudioRecorder: () => ({
    state: "idle",
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    error: null,
  }),
}));

vi.mock("./usePitchDetection", () => ({
  usePitchDetection: () => ({
    detect: mockDetect,
    preload: mockPreload,
    isLoading: false,
    progress: 0,
    error: null,
  }),
}));

vi.mock("./useAudioPlayback", () => ({
  useAudioPlayback: () => ({
    isPlaying: false,
    duration: 0,
    load: mockAudioLoad,
    loadBlob: mockAudioLoadBlob,
    reset: mockAudioReset,
    play: vi.fn(),
    pause: vi.fn(),
  }),
}));

vi.mock("./useMidiPlayback", () => ({
  useMidiPlayback: () => ({
    isPlaying: false,
    currentTimeS: 0,
    duration: 0,
    load: mockMidiLoad,
    play: vi.fn(),
    stop: mockMidiStop,
    previewNote: vi.fn(),
  }),
}));

vi.mock("../lib/db", () => ({
  listSessions: mockListSessions,
  saveSession: mockSaveSession,
  deleteSession: mockDeleteSession,
}));

vi.mock("../lib/audioStorage", () => ({
  readPcmFromOpfs: mockReadPcmFromOpfs,
  savePcmToOpfs: mockSavePcmToOpfs,
  saveBlobToOpfs: mockSaveBlobToOpfs,
  readBlobFromOpfs: mockReadBlobFromOpfs,
  deleteStoredAudio: mockDeleteStoredAudio,
}));

vi.mock("../lib/audioImport", () => ({
  decodeAudioFile: mockDecodeAudioFile,
}));

vi.mock("../lib/audioEncoder", () => ({
  encodeCompressed: mockEncodeCompressed,
  mimeToExtension: vi.fn(() => "webm"),
}));

vi.mock("../lib/keyDetector", () => ({
  detectKey: mockDetectKey,
}));

vi.mock("../lib/chordDetector", () => ({
  detectChord: mockDetectChord,
  detectChordTimeline: mockDetectChordTimeline,
  formatChordName: mockFormatChordName,
  detectChordsWindowed: mockDetectChordsWindowed,
}));

function stubLocalStorage(profileValue: string | null = null) {
  const storage = {
    getItem: vi.fn((key: string) => (key === "riff:instrument-profile" ? profileValue : null)),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };

  vi.stubGlobal("localStorage", storage);

  return storage;
}

describe("useRiffSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubLocalStorage();

    mockStopRecording.mockReset();
    mockStartRecording.mockReset();
    mockDetect.mockReset();
    mockPreload.mockReset().mockResolvedValue(undefined);
    mockAudioLoad.mockReset();
    mockAudioLoadBlob.mockReset();
    mockAudioReset.mockReset();
    mockMidiLoad.mockReset();
    mockMidiStop.mockReset();
    mockListSessions.mockReset().mockResolvedValue([]);
    mockSaveSession.mockReset();
    mockDeleteSession.mockReset();
    mockReadPcmFromOpfs.mockReset();
    mockReadBlobFromOpfs.mockReset();
    mockDeleteStoredAudio.mockReset();
    mockDecodeAudioFile.mockReset();
    mockEncodeCompressed.mockReset();
    mockSavePcmToOpfs.mockReset();
    mockSaveBlobToOpfs.mockReset();
    mockDetectChordTimeline.mockReset().mockReturnValue([]);
    mockDetectChordsWindowed.mockReset().mockReturnValue(null);
    mockDetectKey.mockReset().mockReturnValue({ primary: null, alternatives: [], ranked: [], lowConfidence: true });
    mockDetectChord.mockReset().mockReturnValue(null);
    mockFormatChordName.mockReset().mockImplementation((value: string) => value);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("preloads the model when the browser becomes idle", async () => {
    const idleCallbacks: Array<() => void> = [];
    const requestIdleCallback = vi.fn((callback: () => void) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });
    const cancelIdleCallback = vi.fn();

    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);

    renderHook(() => useRiffSession());

    expect(requestIdleCallback).toHaveBeenCalledTimes(1);
    expect(mockPreload).not.toHaveBeenCalled();

    await act(async () => {
      idleCallbacks[0]?.();
    });

    expect(mockPreload).toHaveBeenCalledTimes(1);
  });

  it("uses the current profile chord window when loading a saved riff", async () => {
    const session = {
      id: "1",
      name: "Take 1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: "recording" as const,
      durationS: 2,
      audioSampleRate: 22050,
      notes: [{ midi: 60, name: "C4", pitchClass: "C", octave: 4, startTimeS: 0, durationS: 1, amplitude: 0.8 }],
      chordTimeline: [],
      keyDetection: null,
      primaryChord: null,
      uniqueNoteNames: ["C"],
      audioFileName: null,
      audioFormat: "pcm" as const,
      audioMime: undefined,
      profileId: "guitar" as const,
    };

    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    act(() => {
      result.current.setProfileId("default");
    });

    await act(async () => {
      await result.current.handleLoadSavedRiff(session);
    });

    expect(mockDetectChordTimeline).toHaveBeenCalledWith(session.notes, PROFILES.default.chordWindowS);
  });

  it("uses the current profile chord window for demo analysis", async () => {
    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    act(() => {
      result.current.setProfileId("default");
    });

    act(() => {
      result.current.handleLoadDemoAnalysis();
    });

    expect(mockDetectChordTimeline).toHaveBeenCalledWith(expect.any(Array), PROFILES.default.chordWindowS);
  });

  it("resets audio playback before starting a new recording", async () => {
    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    act(() => {
      result.current.handleStart();
    });

    expect(mockAudioReset).toHaveBeenCalledTimes(1);
    expect(mockMidiStop).toHaveBeenCalledTimes(1);
    expect(mockStartRecording).toHaveBeenCalledTimes(1);
  });

  it("resets audio playback before importing replacement audio", async () => {
    const importedAudio = {
      analysisAudio: new Float32Array([0.1, -0.1]),
      storedAudio: new Float32Array([0.1, -0.1, 0.2, -0.2]),
      storedSampleRate: 44100,
    };
    mockDecodeAudioFile.mockResolvedValue(importedAudio);

    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.handleImport(new File(["audio"], "take.wav", { type: "audio/wav" }));
    });

    expect(mockAudioReset).toHaveBeenCalledTimes(1);
    expect(mockMidiStop).toHaveBeenCalledTimes(1);
    expect(mockAudioReset.mock.invocationCallOrder[0]).toBeLessThan(
      mockAudioLoad.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(mockAudioLoad).toHaveBeenCalledWith(importedAudio.storedAudio, 44100);
    expect(result.current.pendingAudioSampleRate).toBe(44100);
  });

  it("defaults to guitar when no stored profile exists", async () => {
    const storage = stubLocalStorage();
    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    expect(result.current.profileId).toBe("guitar");
    const profileWrites = storage.setItem.mock.calls.filter(([key]) => key === "riff:instrument-profile");
    expect(profileWrites).toHaveLength(0);
  });

  it.each(["piano", "banjo"])(
    "rewrites a stale stored profile id (%s) back to guitar",
    async (storedProfileId) => {
      const storage = stubLocalStorage(storedProfileId);

      const { result } = renderHook(() => useRiffSession());

      await waitFor(() => {
        expect(mockPreload).toHaveBeenCalled();
      });

      expect(result.current.profileId).toBe("guitar");
      expect(storage.setItem).toHaveBeenCalledWith("riff:instrument-profile", "guitar");
    }
  );

  it("analyzes takes with the guitar-first detection profile by default", async () => {
    const sourceAudio = {
      analysisAudio: new Float32Array([0.1, -0.1, 0.2]),
      storedAudio: new Float32Array([0.1, -0.1, 0.2, 0.3]),
      storedSampleRate: 44100,
    };
    mockDetect.mockResolvedValue({
      audio: sourceAudio.analysisAudio,
      notes: [
        {
          pitchMidi: 60,
          startTimeS: 0,
          durationS: 0.25,
          amplitude: 0.8,
        },
        {
          pitchMidi: 28,
          startTimeS: 0.1,
          durationS: 0.25,
          amplitude: 0.8,
        },
      ],
    });
    mockDetectChordsWindowed.mockReturnValue("CM");
    mockFormatChordName.mockReturnValue("C Major");

    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.handleAnalyze(sourceAudio);
    });

    expect(mockDetect).toHaveBeenCalledWith(sourceAudio.analysisAudio, {
      confidenceThreshold: PROFILES.guitar.confidenceThreshold,
      onsetThreshold: PROFILES.guitar.onsetThreshold,
      maxPolyphony: PROFILES.guitar.maxPolyphony,
    });
    expect(mockDetectChordTimeline).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          midi: 60,
          pitchClass: "C",
        }),
      ],
      PROFILES.guitar.chordWindowS,
    );
    expect(mockDetectChordsWindowed).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          midi: 60,
        }),
      ],
      PROFILES.guitar.chordWindowS,
    );
    expect(mockDetectChord).not.toHaveBeenCalled();
    expect(mockMidiLoad).toHaveBeenCalledWith([
      expect.objectContaining({
        midi: 60,
      }),
    ]);
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0]?.midi).toBe(60);
    expect(result.current.chord).toBe("C Major");
  });

  it("stores native-rate PCM for sessions while analyzing at 22050 Hz", async () => {
    const sourceAudio = {
      analysisAudio: new Float32Array([0.1, -0.1, 0.2]),
      storedAudio: new Float32Array([0.1, -0.1, 0.2, 0.3]),
      storedSampleRate: 44100,
    };
    mockDetect.mockResolvedValue({
      audio: sourceAudio.analysisAudio,
      notes: [
        {
          pitchMidi: 60,
          startTimeS: 0,
          durationS: 0.25,
          amplitude: 0.8,
        },
      ],
    });
    mockSavePcmToOpfs.mockResolvedValue(true);

    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.handleAnalyze(sourceAudio);
    });

    expect(mockSavePcmToOpfs).toHaveBeenCalledWith(
      expect.stringMatching(/^riff-.*\.f32$/),
      sourceAudio.storedAudio,
    );
    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        audioFormat: "pcm",
        audioSampleRate: 44100,
        durationS: sourceAudio.storedAudio.length / 44100,
      }),
    );
  });

  it("stores native-rate compressed audio when compressed storage is enabled", async () => {
    const encodedBlob = new Blob(["native"], { type: "audio/webm" });
    const sourceAudio = {
      analysisAudio: new Float32Array([0.1, -0.1, 0.2]),
      storedAudio: new Float32Array([0.1, -0.1, 0.2, 0.3]),
      storedSampleRate: 44100,
    };
    mockDetect.mockResolvedValue({
      audio: sourceAudio.analysisAudio,
      notes: [
        {
          pitchMidi: 60,
          startTimeS: 0,
          durationS: 0.25,
          amplitude: 0.8,
        },
      ],
    });
    mockEncodeCompressed.mockResolvedValue({
      blob: encodedBlob,
      mime: "audio/webm;codecs=opus",
    });
    mockSaveBlobToOpfs.mockResolvedValue(true);

    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    act(() => {
      result.current.setStorageFormat("compressed");
    });

    await act(async () => {
      await result.current.handleAnalyze(sourceAudio);
    });

    expect(mockEncodeCompressed).toHaveBeenCalledWith(sourceAudio.storedAudio, 44100);
    expect(result.current.compressedBlob).toBe(encodedBlob);
    expect(result.current.compressedMime).toBe("audio/webm;codecs=opus");
    expect(mockSaveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        audioFormat: "compressed",
        audioMime: "audio/webm;codecs=opus",
        audioSampleRate: 44100,
      }),
    );
  });

  it("deletes persisted audio when removing a saved session", async () => {
    const session = {
      id: "saved-1",
      name: "Take 1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: "recording" as const,
      durationS: 2,
      audioSampleRate: 22050,
      notes: [{ midi: 60, name: "C4", pitchClass: "C", octave: 4, startTimeS: 0, durationS: 1, amplitude: 0.8 }],
      chordTimeline: [],
      keyDetection: null,
      primaryChord: null,
      uniqueNoteNames: ["C"],
      audioFileName: "saved-1.f32",
      audioFormat: "pcm" as const,
      audioMime: undefined,
      profileId: "guitar" as const,
    };
    mockListSessions.mockResolvedValue([session]);
    mockReadPcmFromOpfs.mockResolvedValue(new Float32Array([0.1, -0.1]));

    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(result.current.savedRiffs).toEqual([session]);
    });

    await act(async () => {
      await result.current.handleLoadSavedRiff(session);
    });

    expect(result.current.activeSessionId).toBe(session.id);

    await act(async () => {
      await result.current.handleDeleteSession(session.id);
    });

    expect(mockDeleteSession).toHaveBeenCalledWith(session.id);
    expect(mockDeleteStoredAudio).toHaveBeenCalledWith("saved-1.f32");
    expect(result.current.savedRiffs).toEqual([]);
    expect(result.current.activeSessionId).toBeNull();
  });

  it("resets audio playback before loading a saved riff", async () => {
    const restoredAudio = new Float32Array([0.1, -0.1]);
    const session = {
      id: "saved-2",
      name: "Take 2",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: "recording" as const,
      durationS: 2,
      audioSampleRate: 22050,
      notes: [{ midi: 60, name: "C4", pitchClass: "C", octave: 4, startTimeS: 0, durationS: 1, amplitude: 0.8 }],
      chordTimeline: [],
      keyDetection: null,
      primaryChord: null,
      uniqueNoteNames: ["C"],
      audioFileName: "saved-2.f32",
      audioFormat: "pcm" as const,
      audioMime: undefined,
      profileId: "guitar" as const,
    };
    mockReadPcmFromOpfs.mockResolvedValue(restoredAudio);

    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.handleLoadSavedRiff(session);
    });

    expect(mockAudioReset).toHaveBeenCalledTimes(1);
    expect(mockMidiStop).toHaveBeenCalledTimes(1);
    expect(mockAudioReset.mock.invocationCallOrder[0]).toBeLessThan(
      mockAudioLoad.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
    expect(mockAudioLoad).toHaveBeenCalledWith(restoredAudio, 22050);
  });

  it("uses persisted audio sample rate when loading saved PCM audio", async () => {
    const restoredAudio = new Float32Array([0.1, -0.1]);
    const session = {
      id: "saved-3",
      name: "Take 3",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: "recording" as const,
      durationS: 2,
      audioSampleRate: 44100,
      notes: [{ midi: 60, name: "C4", pitchClass: "C", octave: 4, startTimeS: 0, durationS: 1, amplitude: 0.8 }],
      chordTimeline: [],
      keyDetection: null,
      primaryChord: null,
      uniqueNoteNames: ["C"],
      audioFileName: "saved-3.f32",
      audioFormat: "pcm" as const,
      audioMime: undefined,
      profileId: "guitar" as const,
    };
    mockReadPcmFromOpfs.mockResolvedValue(restoredAudio);

    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    await act(async () => {
      await result.current.handleLoadSavedRiff(session);
    });

    expect(mockAudioLoad).toHaveBeenCalledWith(restoredAudio, 44100);
    expect(result.current.pendingAudioSampleRate).toBe(44100);
  });

  it("resets audio playback when switching to demo analysis", async () => {
    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    act(() => {
      result.current.handleLoadDemoAnalysis();
    });

    expect(mockAudioReset).toHaveBeenCalledTimes(1);
    expect(mockMidiStop).toHaveBeenCalledTimes(1);
    expect(mockAudioLoad).not.toHaveBeenCalled();
    expect(mockAudioLoadBlob).not.toHaveBeenCalled();
  });
});
