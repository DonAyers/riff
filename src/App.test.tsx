import type { Ref } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import App from "./App";
import { useRiffSession } from "./hooks/useRiffSession";
import { THEME_STORAGE_KEY } from "./hooks/useThemePreference";
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
vi.mock("./components/GuitarTuner", () => ({
  GuitarTuner: () => <div data-testid="guitar-tuner" />,
}));
vi.mock("./components/SongBuilder", () => ({
  SongBuilder: () => <div data-testid="song-builder" />,
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

function installMatchMedia(initialLightMode: boolean) {
  let isLightMode = initialLightMode;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    media: "(prefers-color-scheme: light)",
    onchange: null,
    get matches() {
      return isLightMode;
    },
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "change") {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "change") {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  vi.stubGlobal("matchMedia", vi.fn(() => mediaQueryList));

  return {
    setLightMode(nextIsLightMode: boolean) {
      isLightMode = nextIsLightMode;
      const event = { matches: isLightMode, media: "(prefers-color-scheme: light)" } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

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
    handleDiscardRecording: vi.fn(),
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
      isLooping: false,
      currentTimeS: 0,
      duration: 0,
      load: vi.fn(),
      play: vi.fn(),
      stop: vi.fn(),
      setLooping: vi.fn(),
      previewNote: vi.fn(),
    },
    ...overrides,
  };
}

describe("App mic permission fallback", () => {
  beforeEach(() => {
    installMatchMedia(false);
    window.history.replaceState(null, "", "/");
    localStorage.removeItem("riff:skip-discard-confirmation");
    localStorage.removeItem(THEME_STORAGE_KEY);
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

  it("renders the mobile-first record screen", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState() as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.getByLabelText(`Build ${buildLabel}`)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /capture/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /analysis/i })).not.toBeInTheDocument();
    expect(
      screen.queryByText("A pocket studio for turning one take into playable chords.")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /record/i })).toBeInTheDocument();
    expect(screen.queryByText(/screen 01/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /recording flow/i })).not.toBeInTheDocument();
    const primaryNav = screen.getByRole("navigation", { name: /primary/i });
    expect(within(primaryNav).getByRole("link", { name: /record/i })).toHaveAttribute("aria-current", "page");
    expect(within(primaryNav).getByRole("link", { name: /builder/i })).toHaveAttribute("href", "/builder");
    expect(within(primaryNav).getByRole("link", { name: /tuner/i })).toHaveAttribute("href", "/tuner");
    expect(screen.queryByTestId("guitar-tuner")).not.toBeInTheDocument();
  });

  it("shows a theme button that persists the selected light mode override", async () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState() as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(screen.getByRole("button", { name: /switch to dark mode/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("follows OS theme changes until the user chooses an override", async () => {
    const matchMedia = installMatchMedia(true);
    useRiffSessionMock.mockReturnValue(
      createSessionState() as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => matchMedia.setLightMode(false));

    expect(document.documentElement.dataset.theme).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    act(() => matchMedia.setLightMode(false));

    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("shows approval controls for a pending take and analyzes on thumbs up", () => {
    const handleAnalyze = vi.fn();
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        hasRecording: true,
        hasPendingAnalysis: true,
        audioPlayback: {
          isPlaying: false,
          duration: 3,
          load: vi.fn(),
          loadBlob: vi.fn(),
          reset: vi.fn(),
          play: vi.fn(),
          pause: vi.fn(),
        },
        handleAnalyze,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.getByTestId("stage-approve")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /take check/i })).toBeInTheDocument();
    expect(screen.getByText(/keep this take/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));

    expect(handleAnalyze).toHaveBeenCalledTimes(1);
  });

  it("confirms before discarding a pending take and can remember the choice", () => {
    const handleDiscardRecording = vi.fn();
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        hasRecording: true,
        hasPendingAnalysis: true,
        handleDiscardRecording,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /retake/i }));

    expect(screen.getByRole("alertdialog", { name: /delete this take/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /next time, retake immediately/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    expect(handleDiscardRecording).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("riff:skip-discard-confirmation")).toBe("true");
  });

  it("renders the song builder route with the shared workspace session", () => {
    window.history.replaceState(null, "", "/builder");
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        chordTimeline: [{ chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 }],
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.getByTestId("song-builder")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /analysis/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("guitar-tuner")).not.toBeInTheDocument();
  });

  it("renders the guitar tuner only on its dedicated route", () => {
    window.history.replaceState(null, "", "/tuner");
    useRiffSessionMock.mockReturnValue(
      createSessionState() as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.getByRole("heading", { level: 2, name: /guitar tuner/i })).toBeInTheDocument();
    expect(screen.getByTestId("guitar-tuner")).toBeInTheDocument();
    expect(screen.queryByTestId("recorder")).not.toBeInTheDocument();
    expect(useRiffSessionMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: /^record$/i }));

    expect(screen.getByTestId("recorder")).toBeInTheDocument();
    expect(screen.queryByTestId("guitar-tuner")).not.toBeInTheDocument();
  });

  it("keeps the recording workspace mounted while visiting the tuner route", () => {
    const handleStart = vi.fn();
    useRiffSessionMock.mockReturnValue(
      createSessionState({ handleStart }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);
    const workspace = screen.getByTestId("riff-workspace");

    fireEvent.click(screen.getByRole("link", { name: /tuner/i }));

    expect(screen.getByRole("heading", { level: 2, name: /guitar tuner/i })).toBeInTheDocument();
    expect(workspace).toHaveAttribute("hidden");
    expect(screen.getByTestId("recorder")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "r" });
    expect(handleStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("link", { name: /^record$/i }));

    expect(workspace).not.toHaveAttribute("hidden");
    expect(screen.getByRole("region", { name: /capture/i })).toBeInTheDocument();
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

  it("shows the app analysis screen while analysis is running", () => {
    useRiffSessionMock.mockReturnValue(
      createSessionState({
        isLoading: true,
        progress: 42,
        hasRecording: true,
      }) as ReturnType<typeof useRiffSession>
    );

    render(<App />);

    expect(screen.getByTestId("progress-bar-panel")).toHaveTextContent(
      "Mapping chords"
    );
    expect(
      screen.getByText(/the chord map drops in as soon as the pass finishes/i)
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
    expect(screen.getByTestId("chord-map-explorer")).toBeInTheDocument();
    expect(screen.getByTestId("key-display")).toBeInTheDocument();
    expect(screen.queryByTestId("note-display")).not.toBeInTheDocument();
    expect(screen.queryByTestId("chord-timeline")).not.toBeInTheDocument();
    expect(screen.queryByTestId("piano-roll")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /notes/i }));

    expect(screen.getByTestId("note-display")).toBeInTheDocument();
    expect(screen.getByTestId("piano-roll")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    expect(await screen.findByTestId("export-panel")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /shape/i }));

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
    fireEvent.click(screen.getByRole("button", { name: /shape/i }));

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
          isLooping: false,
          currentTimeS: 0,
          duration: 1,
          load: vi.fn(),
          play: midiPlay,
          stop: midiStop,
          setLooping: vi.fn(),
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
          isLooping: false,
          currentTimeS: 0,
          duration: 1,
          load: vi.fn(),
          play: midiPlay,
          stop: vi.fn(),
          setLooping: vi.fn(),
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

    expect(screen.queryByRole("button", { name: "Export as MIDI" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "e" });

    const exportButton = await screen.findByRole("button", { name: "Export as MIDI" });
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
