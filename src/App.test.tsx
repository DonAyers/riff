import type { Ref } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import App from "./App";
import { useRiffSession } from "./hooks/useRiffSession";
import { buildLabel } from "./lib/buildInfo";
import { lookupVoicings } from "./lib/chordVoicings";
import { getVariateSuggestions } from "./lib/chordSubstitutions";
import { detectStorageEvictionRisk } from "./lib/storageEvictionRisk";

const { hasSeenOnboardingMock } = vi.hoisted(() => ({
  hasSeenOnboardingMock: vi.fn(() => true),
}));

vi.mock("./hooks/useRiffSession", () => ({
  useRiffSession: vi.fn(),
}));

vi.mock("./components/Recorder", () => ({
  Recorder: () => <div data-testid="recorder" />,
}));
vi.mock("./components/LaneToggle", () => ({
  LaneToggle: ({ onChange }: { activeLane: "song" | "chord"; onChange: (lane: "song" | "chord") => void }) => (
    <div>
      <button onClick={() => onChange("song")}>Melody</button>
      <button onClick={() => onChange("chord")}>Guitar</button>
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
  ProgressBar: ({
    visible,
    label,
    description,
    variant = "inline",
  }: {
    visible: boolean;
    label?: string;
    description?: string;
    variant?: "inline" | "panel";
  }) =>
    visible ? (
      <div data-testid={`progress-bar-${variant}`}>
        <span>{label}</span>
        <span>{description}</span>
      </div>
    ) : null,
}));
vi.mock("./components/Playback", () => ({
  Playback: ({ label }: { label: string }) => <div data-testid="playback">{label}</div>,
}));
vi.mock("./components/SessionPicker", () => ({
  SessionPicker: () => <div data-testid="session-picker" />,
}));
vi.mock("./components/ExportPanel", () => ({
  ExportPanel: ({
    shortcutTargetRef,
  }: {
    shortcutTargetRef?: Ref<HTMLButtonElement>;
  }) => (
    <div data-testid="export-panel">
      <button ref={shortcutTargetRef}>Export as MIDI</button>
    </div>
  ),
}));
vi.mock("./components/OnboardingSheet", () => ({
  OnboardingSheet: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Help and about Riff">
      <button onClick={onClose}>Close</button>
    </div>
  ),
  hasSeenOnboarding: hasSeenOnboardingMock,
}));
vi.mock("./lib/chordVoicings", () => ({
  lookupVoicings: vi.fn(),
}));
vi.mock("./lib/chordSubstitutions", () => ({
  getVariateSuggestions: vi.fn(),
}));
vi.mock("./lib/storageEvictionRisk", () => ({
  detectStorageEvictionRisk: vi.fn(),
}));

const useRiffSessionMock = vi.mocked(useRiffSession);
const lookupVoicingsMock = vi.mocked(lookupVoicings);
const getVariateSuggestionsMock = vi.mocked(getVariateSuggestions);
const detectStorageEvictionRiskMock = vi.mocked(detectStorageEvictionRisk);

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
    activeSessionId: null,
    handleLoadSavedRiff: vi.fn(),
    handleDeleteSession: vi.fn(),
    pendingAudio: null,
    pendingAudioSampleRate: null,
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
       reset: vi.fn(),
       play: vi.fn(),
       pause: vi.fn(),
     },
    midiPlayback: {
      isPlaying: false,
      currentTimeS: 0,
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
    detectStorageEvictionRiskMock.mockReset();
    detectStorageEvictionRiskMock.mockResolvedValue(false);
    hasSeenOnboardingMock.mockReset();
    hasSeenOnboardingMock.mockReturnValue(true);
  });

  it("renders capture and analysis workspace regions", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState() as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.getByLabelText(`Build ${buildLabel}`)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /capture/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: /analysis/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Capture an idea, then review the notes or chords in one place.")
    ).toBeInTheDocument();
    expect(screen.getByText(/step 1/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /capture/i })).toBeInTheDocument();
    expect(screen.getByText(/step 2/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing to review yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /melody/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guitar/i })).toBeInTheDocument();
  });

  it("shows the storage export reminder when risk is detected for saved riffs", async () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        savedRiffs: [
          {
            id: "saved-1",
            name: "Take 1",
            createdAt: 1,
            updatedAt: 1,
            source: "recording",
            durationS: 4,
            audioFileName: null,
            profileId: "guitar",
            notes: [],
            chordTimeline: [],
            keyDetection: null,
            primaryChord: null,
            uniqueNoteNames: [],
          },
        ],
      }) as ReturnType<typeof useRiffSession>
    );
    detectStorageEvictionRiskMock.mockResolvedValue(true);

    render(<App />);

    expect(await screen.findByRole("note", { name: /export reminder/i })).toBeInTheDocument();
    expect(screen.getByText(/saved riffs can clear out on this browser/i)).toBeInTheDocument();
  });

  it("keeps the storage export reminder hidden when there are no saved riffs", async () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState() as ReturnType<typeof useRiffSession>
    );
    detectStorageEvictionRiskMock.mockResolvedValue(true);

    render(<App />);

    expect(await screen.findByTestId("session-picker")).toBeInTheDocument();
    expect(screen.queryByRole("note", { name: /export reminder/i })).not.toBeInTheDocument();
  });

  it("shows calmer loading states in both shell panels while analysis is running", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        isLoading: true,
        progress: 42,
        hasRecording: true,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.getByTestId("progress-bar-inline")).toHaveTextContent(
      "Working on your audio"
    );
    expect(screen.getByTestId("progress-bar-panel")).toHaveTextContent(
      "Listening for notes"
    );
    expect(
      screen.getByText(/this panel updates on its own when the pass finishes/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("MIDI preview")).not.toBeInTheDocument();
  });

  it("renders analysis widgets when notes are available", async () => {
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
    expect(await screen.findByTestId("export-panel")).toBeInTheDocument();
    expect(screen.getByText("MIDI preview")).toBeInTheDocument();
  });

  it("switches to chord lane and shows the fretboard state", async () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        chord: "C Major",
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /guitar/i }));

    expect(screen.getByText(/shape 1 of \d+/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next shape/i })).toBeInTheDocument();
    expect(await screen.findByTestId("chord-fretboard")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /guitar/i }));
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

    fireEvent.click(screen.getByRole("button", { name: /guitar/i }));

    expect(screen.getByText(/no guitar shape yet/i)).toBeInTheDocument();
    expect(screen.getByText(/does not have a saved guitar shape yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("chord-fretboard")).not.toBeInTheDocument();
  });

  it("starts recording from the record shortcut when focus is safe", () => {
    const handleStart = vi.fn();

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        handleStart,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.keyDown(window, { key: "r" });

    expect(handleStart).toHaveBeenCalledTimes(1);
  });

  it("stops recording from the record shortcut while recording", () => {
    const handleStop = vi.fn();

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        recorderState: "recording",
        handleStop,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.keyDown(window, { key: "r" });

    expect(handleStop).toHaveBeenCalledTimes(1);
  });

  it("routes playback shortcuts to the active preview", () => {
    const audioPause = vi.fn();
    const midiPlay = vi.fn();
    const midiStop = vi.fn();

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        audioPlayback: {
          isPlaying: true,
          duration: 1,
          load: vi.fn(),
          loadBlob: vi.fn(),
          reset: vi.fn(),
          play: vi.fn(),
          pause: audioPause,
        },
        midiPlayback: {
          isPlaying: false,
          currentTimeS: 0,
          duration: 1,
          load: vi.fn(),
          play: midiPlay,
          stop: midiStop,
          previewNote: vi.fn(),
        },
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.keyDown(window, { key: "p" });

    expect(audioPause).toHaveBeenCalledTimes(1);
    expect(midiPlay).not.toHaveBeenCalled();
    expect(midiStop).not.toHaveBeenCalled();
  });

  it("starts the MIDI preview from the playback shortcut when results are ready", () => {
    const midiPlay = vi.fn();

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        midiPlayback: {
          isPlaying: false,
          currentTimeS: 0,
          duration: 1,
          load: vi.fn(),
          play: midiPlay,
          stop: vi.fn(),
          previewNote: vi.fn(),
        },
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.keyDown(window, { key: "p" });

    expect(midiPlay).toHaveBeenCalledTimes(1);
  });

  it("runs analysis from the analyze shortcut when the take is ready", () => {
    const handleAnalyze = vi.fn();

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        handleAnalyze,
        hasPendingAnalysis: true,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.keyDown(window, { key: "a" });

    expect(handleAnalyze).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the export shortcut target when results are available", async () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    const exportButton = await screen.findByRole("button", { name: "Export as MIDI" });
    fireEvent.keyDown(window, { key: "e" });

    expect(exportButton).toHaveFocus();
  });

  it("ignores shortcuts while the focus is inside an input", () => {
    const handleAnalyze = vi.fn();

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        handleAnalyze,
        hasPendingAnalysis: true,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: "a" });

    expect(handleAnalyze).not.toHaveBeenCalled();

    input.remove();
  });

  it("keeps shortcuts disabled while the onboarding dialog is open", () => {
    const handleStart = vi.fn();
    hasSeenOnboardingMock.mockReturnValue(false);

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        handleStart,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.getByRole("dialog", { name: /help and about riff/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "r" });

    expect(handleStart).not.toHaveBeenCalled();
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
