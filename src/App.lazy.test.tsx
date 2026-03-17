import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";
import type { ChordEvent } from "./lib/chordDetector";
import type { useRiffSession } from "./hooks/useRiffSession";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
}

interface MockAppModulesOptions {
  exportPanelFactory?: () => Promise<{ ExportPanel: ComponentType }>;
  chordFretboardFactory?: () => Promise<{ ChordFretboard: ComponentType }>;
  selectedChordDialogFactory?: () => Promise<{ SelectedChordDialog: ComponentType }>;
}

const useRiffSessionMock = vi.fn();
const lookupVoicingsMock = vi.fn();
const getVariateSuggestionsMock = vi.fn();
const detectStorageEvictionRiskMock = vi.fn();

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
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
    handleImport: vi.fn(),
    isImporting: false,
    storageFormat: "pcm",
    setStorageFormat: vi.fn(),
    savedRiffs: [],
    activeSessionId: null,
    handleLoadSavedRiff: vi.fn(),
    handleDeleteSession: vi.fn(),
    pendingAudio: new Float32Array([0.1, 0.2]),
    pendingAudioSampleRate: 22050,
    activeRiffName: "Lazy Test",
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

function mockAppModules(options: MockAppModulesOptions = {}) {
  vi.doMock("./hooks/useRiffSession", () => ({
    useRiffSession: useRiffSessionMock,
  }));
  vi.doMock("./components/Recorder", () => ({
    Recorder: () => <div data-testid="recorder" />,
  }));
  vi.doMock("./components/LaneToggle", () => ({
    LaneToggle: ({
      onChange,
    }: {
      activeLane: "song" | "chord";
      onChange: (lane: "song" | "chord") => void;
    }) => (
      <div>
        <button onClick={() => onChange("song")}>Melody</button>
        <button onClick={() => onChange("chord")}>Guitar</button>
      </div>
    ),
  }));
  vi.doMock("./components/KeyDisplay", () => ({
    KeyDisplay: () => <div data-testid="key-display" />,
  }));
  vi.doMock("./components/ChordTimeline", () => ({
    ChordTimeline: () => <div data-testid="chord-timeline" />,
  }));
  vi.doMock("./components/NoteDisplay", () => ({
    NoteDisplay: () => <div data-testid="note-display" />,
  }));
  vi.doMock("./components/ChordDisplay", () => ({
    ChordDisplay: ({
      chordName,
      onChordSelect,
    }: {
      chordName?: string | null;
      onChordSelect?: (chord: string, context?: ChordEvent) => void;
    }) => (
      <button onClick={() => onChordSelect?.(chordName ?? "C Major")}>
        Open {chordName ?? "C Major"}
      </button>
    ),
  }));
  vi.doMock("./components/PianoRoll", () => ({
    PianoRoll: () => <div data-testid="piano-roll" />,
  }));
  vi.doMock("./components/ProgressBar", () => ({
    ProgressBar: ({ visible }: { visible: boolean }) =>
      visible ? <div data-testid="progress-bar" /> : null,
  }));
  vi.doMock("./components/Playback", () => ({
    Playback: ({ label }: { label: string }) => <div data-testid="playback">{label}</div>,
  }));
  vi.doMock("./components/SessionPicker", () => ({
    SessionPicker: () => <div data-testid="session-picker" />,
  }));
  vi.doMock("./components/StorageEvictionPrompt", () => ({
    StorageEvictionPrompt: () => <div data-testid="storage-eviction-prompt" />,
  }));
  vi.doMock("./components/OnboardingSheet", () => ({
    OnboardingSheet: () => null,
    hasSeenOnboarding: () => true,
  }));
  vi.doMock("./lib/chordVoicings", () => ({
    lookupVoicings: lookupVoicingsMock,
  }));
  vi.doMock("./lib/chordSubstitutions", () => ({
    getVariateSuggestions: getVariateSuggestionsMock,
  }));
  vi.doMock("./lib/storageEvictionRisk", () => ({
    detectStorageEvictionRisk: detectStorageEvictionRiskMock,
  }));
  vi.doMock(
    "./components/ExportPanel",
    options.exportPanelFactory ??
      (() =>
        Promise.resolve({
          ExportPanel: () => <div data-testid="export-panel" />,
        }))
  );
  vi.doMock(
    "./components/ChordFretboard",
    options.chordFretboardFactory ??
      (() =>
        Promise.resolve({
          ChordFretboard: () => <div data-testid="chord-fretboard" />,
        }))
  );
  vi.doMock(
    "./components/SelectedChordDialog",
    options.selectedChordDialogFactory ??
      (() =>
        Promise.resolve({
          SelectedChordDialog: () => <div data-testid="selected-chord-dialog" />,
        }))
  );
}

async function renderApp() {
  const { default: App } = await import("./App");
  return render(<App />);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  lookupVoicingsMock.mockReturnValue([
    {
      frets: [-1, 3, 2, 0, 1, 0],
      fingers: [0, 3, 2, 0, 1, 0],
      barres: [],
      baseFret: 1,
    },
  ]);
  getVariateSuggestionsMock.mockReturnValue([]);
  detectStorageEvictionRiskMock.mockResolvedValue(false);
});

describe("App lazy analysis surfaces", () => {
  it("shows an accessible export fallback until the export panel chunk resolves", async () => {
    const exportPanelDeferred = createDeferred<void>();

    mockAppModules({
      exportPanelFactory: async () => {
        await exportPanelDeferred.promise;
        return {
          ExportPanel: () => <div data-testid="export-panel" />,
        };
      },
    });

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        chord: "C Major",
      }) as ReturnType<typeof useRiffSession>
    );

    await renderApp();

    expect(screen.getByRole("status", { name: /loading export options/i })).toBeInTheDocument();
    expect(screen.getByText(/preparing export tools/i)).toBeInTheDocument();

    await act(async () => {
      exportPanelDeferred.resolve();
      await exportPanelDeferred.promise;
    });

    expect(await screen.findByTestId("export-panel")).toBeInTheDocument();
    expect(screen.queryByText(/preparing export tools/i)).not.toBeInTheDocument();
  });

  it("keeps the chord lane stable while the fretboard chunk loads", async () => {
    const chordFretboardDeferred = createDeferred<void>();

    mockAppModules({
      chordFretboardFactory: async () => {
        await chordFretboardDeferred.promise;
        return {
          ChordFretboard: () => <div data-testid="chord-fretboard" />,
        };
      },
    });

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        chord: "C Major",
      }) as ReturnType<typeof useRiffSession>
    );

    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: /guitar/i }));

    expect(screen.getByText(/loading shape/i)).toBeInTheDocument();
    expect(screen.getByText(/preparing the guitar diagram for c major/i)).toBeInTheDocument();

    await act(async () => {
      chordFretboardDeferred.resolve();
      await chordFretboardDeferred.promise;
    });

    expect(await screen.findByTestId("chord-fretboard")).toBeInTheDocument();
    expect(screen.queryByText(/loading shape/i)).not.toBeInTheDocument();
  });

  it("shows a closable dialog fallback while the selected chord sheet chunk loads", async () => {
    const selectedChordDialogDeferred = createDeferred<void>();

    mockAppModules({
      selectedChordDialogFactory: async () => {
        await selectedChordDialogDeferred.promise;
        return {
          SelectedChordDialog: () => <div data-testid="selected-chord-dialog" />,
        };
      },
    });

    useRiffSessionMock.mockReturnValue(
      createSessionState({
        notes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        uniqueNotes: [{ midi: 60, name: "C4", startTimeS: 0, durationS: 1, amplitude: 0.8 }],
        chord: "C Major",
      }) as ReturnType<typeof useRiffSession>
    );

    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: /open c major/i }));

    const dialog = screen.getByRole("dialog", { name: /selected guitar chord/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/loading chord details/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close selected chord/i }));

    expect(screen.queryByRole("dialog", { name: /selected guitar chord/i })).not.toBeInTheDocument();

    await act(async () => {
      selectedChordDialogDeferred.resolve();
      await selectedChordDialogDeferred.promise;
    });
  });
});
