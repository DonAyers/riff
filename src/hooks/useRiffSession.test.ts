import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRiffSession } from "./useRiffSession";
import { PROFILES } from "../lib/instrumentProfiles";

const {
  mockStopRecording,
  mockDetect,
  mockPreload,
  mockAudioLoad,
  mockAudioLoadBlob,
  mockMidiLoad,
  mockMidiStop,
  mockListRiffs,
  mockSaveRiff,
  mockReadPcmFromOpfs,
  mockReadBlobFromOpfs,
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
  mockStopRecording: vi.fn(),
  mockDetect: vi.fn(),
  mockPreload: vi.fn(),
  mockAudioLoad: vi.fn(),
  mockAudioLoadBlob: vi.fn(),
  mockMidiLoad: vi.fn(),
  mockMidiStop: vi.fn(),
  mockListRiffs: vi.fn(),
  mockSaveRiff: vi.fn(),
  mockReadPcmFromOpfs: vi.fn(),
  mockReadBlobFromOpfs: vi.fn(),
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
    startRecording: vi.fn(),
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
    play: vi.fn(),
    pause: vi.fn(),
  }),
}));

vi.mock("./useMidiPlayback", () => ({
  useMidiPlayback: () => ({
    isPlaying: false,
    duration: 0,
    load: mockMidiLoad,
    play: vi.fn(),
    stop: mockMidiStop,
    previewNote: vi.fn(),
  }),
}));

vi.mock("../lib/db", () => ({
  listRiffs: mockListRiffs,
  saveRiff: mockSaveRiff,
}));

vi.mock("../lib/audioStorage", () => ({
  readPcmFromOpfs: mockReadPcmFromOpfs,
  savePcmToOpfs: mockSavePcmToOpfs,
  saveBlobToOpfs: mockSaveBlobToOpfs,
  readBlobFromOpfs: mockReadBlobFromOpfs,
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
    mockDetect.mockReset();
    mockPreload.mockReset().mockResolvedValue(undefined);
    mockAudioLoad.mockReset();
    mockAudioLoadBlob.mockReset();
    mockMidiLoad.mockReset();
    mockMidiStop.mockReset();
    mockListRiffs.mockReset().mockResolvedValue([]);
    mockSaveRiff.mockReset();
    mockReadPcmFromOpfs.mockReset();
    mockReadBlobFromOpfs.mockReset();
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

  it("uses the current profile chord window when loading a saved riff", async () => {
    const riff = {
      id: "1",
      name: "Take 1",
      timestamp: Date.now(),
      durationS: 2,
      notes: [{ midi: 60, name: "C4", pitchClass: "C", octave: 4, startTimeS: 0, durationS: 1, amplitude: 0.8 }],
      chord: null,
      audioFileName: null,
      audioFormat: "pcm" as const,
      audioMime: undefined,
    };

    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    act(() => {
      result.current.setProfileId("default");
    });

    await act(async () => {
      await result.current.handleLoadSavedRiff(riff);
    });

    expect(mockDetectChordTimeline).toHaveBeenCalledWith(riff.notes, PROFILES.default.chordWindowS);
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
    const sourceAudio = new Float32Array([0.1, -0.1, 0.2]);
    mockDetect.mockResolvedValue({
      audio: sourceAudio,
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

    expect(mockDetect).toHaveBeenCalledWith(sourceAudio, {
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
});
