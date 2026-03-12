import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import App from "./App";
import { useRiffSession } from "./hooks/useRiffSession";
import { buildLabel } from "./lib/buildInfo";
import { lookupVoicings } from "./lib/chordVoicings";
import { getVariateSuggestions } from "./lib/chordSubstitutions";

vi.mock("./hooks/useRiffSession", () => ({
  useRiffSession: vi.fn(),
}));

vi.mock("./components/Recorder", () => ({
  Recorder: () => <div data-testid="recorder" />,
}));
vi.mock("./components/LaneToggle", () => ({
  LaneToggle: ({ activeLane, onChange }: { activeLane: "song" | "chord"; onChange: (lane: "song" | "chord") => void }) => (
    <div>
      <button onClick={() => onChange("song")}>Song</button>
      <button onClick={() => onChange("chord")}>Chord</button>
    </div>
  ),
}));
vi.mock("./components/NoteDisplay", () => ({
  NoteDisplay: () => <div data-testid="note-display" />,
}));
vi.mock("./components/KeyDisplay", () => ({
  KeyDisplay: () => <div data-testid="key-display" />,
}));
vi.mock("./components/ChordDisplay", () => ({
  ChordDisplay: () => <div data-testid="chord-display" />,
}));
vi.mock("./components/ChordTimeline", () => ({
  ChordTimeline: () => <div data-testid="chord-timeline" />,
}));
vi.mock("./components/ChordFretboard", () => ({
  ChordFretboard: () => <div data-testid="chord-fretboard" />,
}));
// PianoRoll remains the timeline visualization component; this is unrelated
// to the removed piano instrument profile.
vi.mock("./components/PianoRoll", () => ({
  PianoRoll: () => <div data-testid="piano-roll" />,
}));
vi.mock("./components/ProgressBar", () => ({
  ProgressBar: () => <div data-testid="progress-bar" />,
}));
vi.mock("./components/Playback", () => ({
  Playback: ({ label }: { label: string }) => <div data-testid="playback">{label}</div>,
}));
vi.mock("./components/SavedRiffs", () => ({
  SavedRiffs: () => <div data-testid="saved-riffs" />,
}));
vi.mock("./components/ExportPanel", () => ({
  ExportPanel: () => <div data-testid="export-panel" />,
}));
vi.mock("./components/OnboardingSheet", () => ({
  OnboardingSheet: () => null,
  hasSeenOnboarding: () => true,
}));
vi.mock("./lib/chordVoicings", () => ({
  lookupVoicings: vi.fn(),
}));
vi.mock("./lib/chordSubstitutions", () => ({
  getVariateSuggestions: vi.fn(),
}));

const useRiffSessionMock = vi.mocked(useRiffSession);
const lookupVoicingsMock = vi.mocked(lookupVoicings);
const getVariateSuggestionsMock = vi.mocked(getVariateSuggestions);

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
    chordTimeline: [],
    keyDetection: null,
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
    pendingAudio: null,
    activeRiffName: "",
    compressedBlob: null,
    compressedMime: null,
    profileId: "guitar",
    setProfileId: vi.fn(),
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
    lookupVoicingsMock.mockReset();
    lookupVoicingsMock.mockImplementation((chordName) => {
      if (chordName === "No Shape") {
        return [];
      }

      if (chordName === "Am") {
        return [
          {
            frets: [-1, 0, 2, 2, 1, 0],
            fingers: [0, 0, 2, 3, 1, 0],
            barres: [],
            baseFret: 1,
          },
        ];
      }

      return [
        {
          frets: [-1, 3, 2, 0, 1, 0],
          fingers: [0, 3, 2, 0, 1, 0],
          barres: [],
          baseFret: 1,
        },
        {
          frets: [8, 10, 10, 9, 8, 8],
          fingers: [1, 3, 4, 2, 1, 1],
          barres: [8],
          baseFret: 8,
        },
      ];
    });
    getVariateSuggestionsMock.mockReset();
    getVariateSuggestionsMock.mockImplementation((chordName) =>
      chordName
        ? [
            {
              name: "Am",
              type: "relative",
              description: "Relative minor",
            },
          ]
        : []
    );
  });

  it("renders capture and analysis workspace regions", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState() as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.getByText(buildLabel)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /capture/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: /analysis/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByText(/song lane ready/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /song/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chord/i })).toBeInTheDocument();
  });

  it("renders analysis widgets when notes are available", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        chord: "C",
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.queryByText(/ready for a take/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("chord-display")).toBeInTheDocument();
    expect(screen.getByTestId("chord-timeline")).toBeInTheDocument();
    expect(screen.getByTestId("key-display")).toBeInTheDocument();
    expect(screen.getByTestId("note-display")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll")).toBeInTheDocument();
    expect(screen.getByText("MIDI preview")).toBeInTheDocument();
  });

  it("switches to chord lane and shows the fretboard state", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        chord: "C Major",
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /chord/i }));

    expect(screen.getByText(/voicing 1 of \d+/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next phrase/i })).toBeInTheDocument();
    expect(screen.getByTestId("chord-fretboard")).toBeInTheDocument();
    expect(screen.queryByTestId("piano-roll")).not.toBeInTheDocument();
  });

  it("lets the chord lane swap to a suggested guitar substitution and clear it", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        chord: "C Major",
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /chord/i }));
    fireEvent.click(screen.getByRole("button", { name: "Am" }));

    expect(lookupVoicingsMock).toHaveBeenLastCalledWith("Am");
    expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));

    expect(lookupVoicingsMock).toHaveBeenLastCalledWith("C Major");
  });

  it("shows the empty chord lane placeholder when no guitar voicing exists yet", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        chord: "No Shape",
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /chord/i }));

    expect(screen.getByText(/no saved voicing yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/does not have a seeded guitar shape yet/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId("chord-fretboard")).not.toBeInTheDocument();
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

    const button = screen.getByRole("button", { name: /try demo take/i });
    fireEvent.click(button);

    expect(handleLoadDemoAnalysis).toHaveBeenCalledTimes(1);
  });

  it("hides demo analysis button when there is no recording error", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState() as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(
      screen.queryByRole("button", { name: /try demo take/i })
    ).not.toBeInTheDocument();
  });
});
