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
  detectChordsWindowed: vi.fn(() => null),
}));

describe("useRiffSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => (key === "riff:instrument-profile" ? null : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });

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
      result.current.setProfileId("piano");
    });

    await act(async () => {
      await result.current.handleLoadSavedRiff(riff);
    });

    expect(mockDetectChordTimeline).toHaveBeenCalledWith(riff.notes, PROFILES.piano.chordWindowS);
  });

  it("uses the current profile chord window for demo analysis", async () => {
    const { result } = renderHook(() => useRiffSession());

    await waitFor(() => {
      expect(mockPreload).toHaveBeenCalled();
    });

    act(() => {
      result.current.setProfileId("piano");
    });

    act(() => {
      result.current.handleLoadDemoAnalysis();
    });

    expect(mockDetectChordTimeline).toHaveBeenCalledWith(expect.any(Array), PROFILES.piano.chordWindowS);
  });
});