import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import App from "./App";
import { useRiffSession } from "./hooks/useRiffSession";

vi.mock("./hooks/useRiffSession", () => ({
  useRiffSession: vi.fn(),
}));

vi.mock("./components/Recorder", () => ({
  Recorder: () => <div data-testid="recorder" />,
}));
vi.mock("./components/NoteDisplay", () => ({
  NoteDisplay: () => <div data-testid="note-display" />,
}));
vi.mock("./components/ChordDisplay", () => ({
  ChordDisplay: () => <div data-testid="chord-display" />,
}));
vi.mock("./components/PianoRoll", () => ({
  PianoRoll: () => <div data-testid="piano-roll" />,
}));
vi.mock("./components/ProgressBar", () => ({
  ProgressBar: () => <div data-testid="progress-bar" />,
}));
vi.mock("./components/Playback", () => ({
  Playback: () => <div data-testid="playback" />,
}));
vi.mock("./components/SavedRiffs", () => ({
  SavedRiffs: () => <div data-testid="saved-riffs" />,
}));

const useRiffSessionMock = vi.mocked(useRiffSession);

function createSessionState(overrides: Record<string, unknown> = {}) {
  return {
    recorderState: "idle",
    handleStart: vi.fn(),
    handleStop: vi.fn(),
    isLoading: false,
    progress: 0,
    handleAnalyze: vi.fn(),
    notes: [],
    uniqueNotes: [],
    chord: null,
    error: null,
    autoProcess: false,
    setAutoProcess: vi.fn(),
    hasRecording: false,
    hasPendingAnalysis: false,
    handleLoadDemoAnalysis: vi.fn(),
    handleImport: vi.fn(),
    isImporting: false,
    storageFormat: "pcm",
    setStorageFormat: vi.fn(),
    savedRiffs: [],
    handleLoadSavedRiff: vi.fn(),
    audioPlayback: {
      isPlaying: false,
      duration: 0,
      load: vi.fn(),
      loadBlob: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
    },
    midiPlayback: {
      isPlaying: false,
      duration: 0,
      load: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      previewNote: vi.fn(),
    },
    ...overrides,
  };
}

describe("App mic permission fallback", () => {
  beforeEach(() => {
    useRiffSessionMock.mockReset();
  });

  it("shows and triggers demo analysis button when recording fails", () => {
    const handleLoadDemoAnalysis = vi.fn();

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        error: "Permission denied",
        handleLoadDemoAnalysis,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    const button = screen.getByRole("button", { name: /load demo analysis/i });
    fireEvent.click(button);

    expect(handleLoadDemoAnalysis).toHaveBeenCalledTimes(1);
  });

  it("hides demo analysis button when there is no recording error", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState() as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(
      screen.queryByRole("button", { name: /load demo analysis/i })
    ).not.toBeInTheDocument();
  });
});
