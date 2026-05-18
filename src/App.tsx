import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { HelpCircle, FlaskConical } from "lucide-react";
import { useRiffSession } from "./hooks/useRiffSession";
import { Recorder } from "./components/Recorder";
import { LaneToggle, type Lane } from "./components/LaneToggle";
import { KeyDisplay } from "./components/KeyDisplay";
import { ChordTimeline } from "./components/ChordTimeline";
import { NoteDisplay } from "./components/NoteDisplay";
import { ChordDisplay } from "./components/ChordDisplay";
import { PianoRoll } from "./components/PianoRoll";
import { ProgressBar } from "./components/ProgressBar";
import { Playback } from "./components/Playback";
import { SessionPicker } from "./components/SessionPicker";
import { StorageEvictionPrompt } from "./components/StorageEvictionPrompt";
import { OnboardingSheet, hasSeenOnboarding } from "./components/OnboardingSheet";
import { GuitarTuner } from "./components/GuitarTuner";
import { buildLabel } from "./lib/buildInfo";
import { lookupVoicings } from "./lib/chordVoicings";
import { getVariateSuggestions } from "./lib/chordSubstitutions";
import type { ChordEvent } from "./lib/chordDetector";
import { detectStorageEvictionRisk } from "./lib/storageEvictionRisk";
import { useGlobalKeyboardShortcuts } from "./hooks/useGlobalKeyboardShortcuts";
import "./components/ChordFretboard.css";
import "./components/ExportPanel.css";
import "./components/SelectedChordDialog.css";
import "./styles/App.css";

const LazyChordFretboard = lazy(async () => {
  const module = await import("./components/ChordFretboard");
  return { default: module.ChordFretboard };
});

const LazyExportPanel = lazy(async () => {
  const module = await import("./components/ExportPanel");
  return { default: module.ExportPanel };
});

const LazySelectedChordDialog = lazy(async () => {
  const module = await import("./components/SelectedChordDialog");
  return { default: module.SelectedChordDialog };
});

const APP_SUBTITLE = "Capture an idea, then review the notes or chords in one place.";
const HOME_PATH = "/";
const TUNER_PATH = "/tuner";

type AppRoute = "home" | "tuner";
type NavigateToRoute = (pathname: string) => void;

const CAPTURE_PANEL_COPY = {
  eyebrow: "Step 1",
  title: "Capture",
  description: "Use the controls below to record or bring in a file. The review panel fills in as soon as analysis finishes.",
} as const;

const WORKFLOW_COPY = {
  song: {
    eyebrow: "Step 2",
    title: "Review notes",
    description: "Notes, timing, and playback show up here together after analysis.",
    emptyKicker: "Nothing to review yet",
    emptyBody: "Record or import something on the left, then come back here for notes, timing, and playback.",
  },
  chord: {
    eyebrow: "Step 2",
    title: "Review chords",
    description: "Key, chord changes, and playable guitar shapes show up here after analysis.",
    emptyKicker: "Nothing to review yet",
    emptyBody: "Record or import something on the left, then come back here for the key, chord changes, and guitar shapes.",
  },
} as const;

const CAPTURE_LOADING_COPY = {
  eyebrow: "Analysis in progress",
  label: "Working on your audio",
  description: "Stay here or switch to review. Results will appear automatically when they are ready.",
} as const;

const ANALYSIS_LOADING_COPY = {
  song: {
    eyebrow: "Analysis in progress",
    label: "Listening for notes",
    description: "Riff is checking pitch and timing now. Notes, timing, and playback will show up here together.",
  },
  chord: {
    eyebrow: "Analysis in progress",
    label: "Checking the chords",
    description: "Riff is checking the key, chord changes, and playable guitar shapes. This panel will fill in here as soon as it is ready.",
  },
} as const;

function normalizePathname(pathname: string): string {
  const trimmedPathname = pathname.replace(/\/+$/, "");
  return trimmedPathname === "" ? HOME_PATH : trimmedPathname;
}

function resolveAppRoute(pathname: string): AppRoute {
  return normalizePathname(pathname) === TUNER_PATH ? "tuner" : "home";
}

function getRoutePathname(route: AppRoute): string {
  return route === "tuner" ? TUNER_PATH : HOME_PATH;
}

function getBrowserPathname(): string {
  return typeof window === "undefined" ? HOME_PATH : window.location.pathname;
}

function useAppRoute() {
  const [route, setRoute] = useState<AppRoute>(() => resolveAppRoute(getBrowserPathname()));

  useEffect(() => {
    const handlePopState = () => setRoute(resolveAppRoute(getBrowserPathname()));

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = useCallback<NavigateToRoute>((pathname) => {
    const nextRoute = resolveAppRoute(pathname);
    const nextPathname = getRoutePathname(nextRoute);

    if (window.location.pathname !== nextPathname) {
      window.history.pushState(null, "", nextPathname);
    }

    setRoute(nextRoute);
  }, []);

  return { route, navigate };
}

interface AppRouteLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  navigate: NavigateToRoute;
  to: string;
}

function AppRouteLink({
  children,
  navigate,
  onClick,
  target,
  to,
  ...props
}: AppRouteLinkProps) {
  const handleClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      (target && target !== "_self")
    ) {
      return;
    }

    event.preventDefault();
    navigate(to);
  };

  return (
    <a {...props} href={to} target={target} onClick={handleClick}>
      {children}
    </a>
  );
}

interface AppTitleProps {
  navigate: NavigateToRoute;
}

function AppTitle({ navigate }: AppTitleProps) {
  return (
    <h1>
      <AppRouteLink className="app-title-link" to={HOME_PATH} navigate={navigate}>
        <i className="note-icon">♪</i> Riff
      </AppRouteLink>
    </h1>
  );
}

function BuildBadge() {
  return (
    <div className="build-badge" aria-label={`Build ${buildLabel}`} title={`Build ${buildLabel}`}>
      {buildLabel}
    </div>
  );
}

interface ExportPanelFallbackProps {
  label?: string;
}

function ExportPanelFallback({ label = "Preparing export tools…" }: ExportPanelFallbackProps) {
  return (
    <div
      className="export-panel-fallback"
      role="status"
      aria-live="polite"
      aria-label="Loading export options"
    >
      <div className="export-panel export-panel--loading" aria-hidden="true">
        <span className="export-label">Export</span>
        <div className="export-buttons">
          <span className="export-btn export-btn--skeleton" />
          <span className="export-btn export-btn--skeleton" />
          <span className="export-btn export-btn--skeleton" />
        </div>
      </div>
      <p className="deferred-loading-copy">{label}</p>
    </div>
  );
}

interface ChordFretboardFallbackProps {
  chordName: string | null;
}

function ChordFretboardFallback({ chordName }: ChordFretboardFallbackProps) {
  return (
    <div className="lane-placeholder lane-placeholder--loading" role="status" aria-live="polite">
      <span className="lane-placeholder__kicker">Guitar shape</span>
      <h3>Loading shape…</h3>
      <p>Preparing the guitar diagram for {chordName ?? "this chord"}.</p>
    </div>
  );
}

interface SelectedChordDialogFallbackProps {
  chord: string;
  context?: ChordEvent;
  onClose: () => void;
}

function SelectedChordDialogFallback({
  chord,
  context,
  onClose,
}: SelectedChordDialogFallbackProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="selected-chord-backdrop deferred-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Selected guitar chord"
      onClick={handleBackdropClick}
    >
      <div className="selected-chord-sheet deferred-dialog__sheet">
        <button
          type="button"
          className="selected-chord-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="selected-chord-sheet__header">
          {context && (
            <p className="selected-chord-sheet__context">
              Timeline chord · {context.startTimeS.toFixed(2)}s
            </p>
          )}
          <h2>{chord}</h2>
          <p className="selected-chord-sheet__meta">Preparing guitar voicing details…</p>
        </div>

        <div className="selected-chord-sheet__body deferred-dialog__body">
          <div className="deferred-dialog__placeholder" role="status" aria-live="polite">
            <span className="lane-placeholder__kicker">Selected chord</span>
            <h3>Loading chord details…</h3>
            <p>Your guitar voicing options will appear here in a moment.</p>
          </div>
        </div>

        <div className="selected-chord-sheet__actions">
          <button type="button" className="analyze-btn analyze-btn--secondary" disabled>
            Next phrase
          </button>
          <button type="button" className="analyze-btn analyze-btn--secondary" onClick={onClose}>
            Close selected chord
          </button>
        </div>
      </div>
    </div>
  );
}

interface RiffWorkspaceProps {
  isActive: boolean;
  navigate: NavigateToRoute;
}

function RiffWorkspace({ isActive, navigate }: RiffWorkspaceProps) {
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const [activeLane, setActiveLane] = useState<Lane>("song");
  const [activeVoicingIndex, setActiveVoicingIndex] = useState(0);
  const [selectedChordName, setSelectedChordName] = useState<string | null>(null);
  const [selectedChordContext, setSelectedChordContext] = useState<ChordEvent | null>(null);
  const [selectedChordVoicingIndex, setSelectedChordVoicingIndex] = useState(0);
  const [variateOverride, setVariateOverride] = useState<string | null>(null);
  const [showStorageEvictionPrompt, setShowStorageEvictionPrompt] = useState(false);
  const {
    recorderState,
    handleStart,
    handleStop,
    isLoading,
    progress,
    handleAnalyze,
    notes,
    uniqueNotes,
    chord,
    chordTimeline,
    keyDetection,
    error,
    autoProcess,
    setAutoProcess,
    hasRecording,
    hasPendingAnalysis,
    handleLoadDemoAnalysis,
    handleImport,
    isImporting,
    storageFormat,
    setStorageFormat,
    savedRiffs,
    activeSessionId,
    handleLoadSavedRiff,
    handleDeleteSession,
    audioPlayback,
    midiPlayback,
    pendingAudio,
    pendingAudioSampleRate,
    activeRiffName,
    compressedBlob,
    compressedMime,
    profileId,
    setProfileId,
  } = useRiffSession();

  const hasResults = notes.length > 0;
  const showPlaybackStack = !isLoading && (hasRecording || hasResults);
  const isSongLane = activeLane === "song";
  const activeWorkflow = WORKFLOW_COPY[activeLane];
  const activeLoadingCopy = ANALYSIS_LOADING_COPY[activeLane];
  const displayedChord = variateOverride ?? chord;
  const chordVoicings = lookupVoicings(displayedChord);
  const variateSuggestions = getVariateSuggestions(displayedChord);
  const activeVoicing = chordVoicings[activeVoicingIndex] ?? null;
  const exportShortcutTargetRef = useRef<HTMLButtonElement>(null);
  const exportPanelProps = {
    notes,
    pcmAudio: pendingAudio,
    pcmSampleRate: pendingAudioSampleRate,
    compressedBlob,
    compressedMime,
    riffName: activeRiffName,
    visible: hasResults,
    shortcutTargetRef: exportShortcutTargetRef,
  } as const;

  useEffect(() => {
    let cancelled = false;

    void detectStorageEvictionRisk().then((shouldWarn) => {
      if (!cancelled) {
        setShowStorageEvictionPrompt(shouldWarn);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setActiveVoicingIndex(0);
    setVariateOverride(null);
    setSelectedChordName(null);
    setSelectedChordContext(null);
    setSelectedChordVoicingIndex(0);
  }, [chord]);

  useEffect(() => {
    setActiveVoicingIndex(0);
  }, [variateOverride]);

  const handleNextVoicing = () => {
    if (chordVoicings.length <= 1) return;
    setActiveVoicingIndex((current) => (current + 1) % chordVoicings.length);
  };

  const handleChordSelect = (chordName: string, context?: ChordEvent) => {
    setSelectedChordName(chordName);
    setSelectedChordContext(context ?? null);
    setSelectedChordVoicingIndex(0);
  };

  const handleCloseSelectedChord = () => {
    setSelectedChordName(null);
    setSelectedChordContext(null);
    setSelectedChordVoicingIndex(0);
  };

  const handlePlaybackShortcut = useCallback(() => {
    if (audioPlayback.isPlaying) {
      audioPlayback.pause();
      return;
    }

    if (midiPlayback.isPlaying) {
      midiPlayback.stop();
      return;
    }

    if (hasResults) {
      void midiPlayback.play();
      return;
    }

    if (hasRecording) {
      void audioPlayback.play();
    }
  }, [audioPlayback, hasRecording, hasResults, midiPlayback]);

  const handleExportShortcut = useCallback(() => {
    exportShortcutTargetRef.current?.focus();
  }, []);

  useGlobalKeyboardShortcuts({
    disabled: !isActive || showOnboarding || selectedChordName !== null,
    handlers: {
      record: {
        enabled: recorderState === "recording" || (!isLoading && !isImporting && recorderState === "idle"),
        run: () => {
          if (recorderState === "recording") {
            void handleStop();
            return;
          }

          if (recorderState === "idle") {
            handleStart();
          }
        },
      },
      playback: {
        enabled: hasRecording || hasResults || audioPlayback.isPlaying || midiPlayback.isPlaying,
        run: handlePlaybackShortcut,
      },
      analyze: {
        enabled: !autoProcess && hasPendingAnalysis && !isLoading && recorderState === "idle",
        run: () => {
          void handleAnalyze();
        },
      },
      export: {
        enabled: hasResults,
        run: handleExportShortcut,
      },
    },
  });

  return (
    <div className="app" data-testid="riff-workspace" hidden={!isActive}>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-main">
            <AppTitle navigate={navigate} />
            <nav className="app-header-actions" aria-label="Primary">
              <AppRouteLink className="app-nav-link" to={TUNER_PATH} navigate={navigate}>
                Tuner
              </AppRouteLink>
              <button
                className="help-btn"
                onClick={() => setShowOnboarding(true)}
                aria-label="Help and about"
              >
                <HelpCircle size={18} strokeWidth={1.8} />
              </button>
            </nav>
          </div>
          <p className="tagline">{APP_SUBTITLE}</p>
        </header>

        <main className="app-main">
          <section className="workspace-pane workspace-pane--capture" aria-label="Capture">
            <div className="workspace-pane__intro">
              <span className="workspace-pane__kicker">{CAPTURE_PANEL_COPY.eyebrow}</span>
              <h2 className="workspace-pane__title">{CAPTURE_PANEL_COPY.title}</h2>
              <p className="workspace-pane__description">{CAPTURE_PANEL_COPY.description}</p>
            </div>
            <div className="recorder-card">
              <Recorder
                state={isLoading ? "processing" : recorderState}
                onStart={handleStart}
                onStop={() => void handleStop()}
                onImport={(file) => void handleImport(file)}
                isImporting={isImporting}
                error={error}
                autoProcess={autoProcess}
                onAutoProcessChange={setAutoProcess}
                storageFormat={storageFormat}
                onStorageFormatChange={(v) => setStorageFormat(v)}
                recorderState={recorderState}
                isLoading={isLoading}
                hasPendingAnalysis={hasPendingAnalysis}
                onAnalyze={() => void handleAnalyze()}
                profileId={profileId}
                onProfileChange={setProfileId}
              />
              {error && !hasResults && (
                <button
                  className="analyze-btn analyze-btn--secondary analyze-btn--demo"
                  onClick={handleLoadDemoAnalysis}
                  disabled={isLoading || recorderState !== "idle"}
                  aria-label="Try demo take"
                >
                  <FlaskConical size={14} strokeWidth={2} aria-hidden="true" />
                  Try demo
                </button>
              )}
              <ProgressBar
                progress={progress}
                visible={isLoading}
                eyebrow={CAPTURE_LOADING_COPY.eyebrow}
                label={CAPTURE_LOADING_COPY.label}
                description={CAPTURE_LOADING_COPY.description}
                ariaLabel="Audio processing progress"
              />
            </div>

            {showPlaybackStack && (
              <div className="playback-stack" aria-label="Playback controls">
                <Playback
                  label="Recording"
                  isPlaying={audioPlayback.isPlaying}
                  duration={audioPlayback.duration}
                  onPlay={audioPlayback.play}
                  onPause={audioPlayback.pause}
                  visible={hasRecording}
                />
                <Playback
                  label="MIDI preview"
                  isPlaying={midiPlayback.isPlaying}
                  duration={midiPlayback.duration}
                  onPlay={midiPlayback.play}
                  onPause={midiPlayback.stop}
                  visible={hasResults}
                />
              </div>
            )}

            <SessionPicker
              sessions={savedRiffs}
              activeSessionId={activeSessionId}
              onLoad={handleLoadSavedRiff}
              onDelete={handleDeleteSession}
            />
            {showStorageEvictionPrompt && savedRiffs.length > 0 && (
              <StorageEvictionPrompt />
            )}
          </section>

          <section className="workspace-pane workspace-pane--analysis" aria-label="Analysis">
            <div className="analysis-panel">
              <div className="analysis-panel__topline">
                <span className="analysis-panel__eyebrow">{activeWorkflow.eyebrow}</span>
              </div>

              <div className="analysis-panel__header">
                <div className="analysis-panel__intro">
                  <h2 className="analysis-panel__title">{activeWorkflow.title}</h2>
                  <p className="analysis-panel__description">{activeWorkflow.description}</p>
                </div>
                <LaneToggle activeLane={activeLane} onChange={setActiveLane} />
              </div>

              {isLoading ? (
                <div className="analysis-loading">
                  <ProgressBar
                    progress={progress}
                    visible={isLoading}
                    eyebrow={activeLoadingCopy.eyebrow}
                    label={activeLoadingCopy.label}
                    description={activeLoadingCopy.description}
                    variant="panel"
                    ariaLabel="Analysis progress"
                  />
                  <p className="analysis-loading__hint">
                    Keep the recording controls handy. This panel updates on its own when the pass finishes.
                  </p>
                </div>
              ) : hasResults ? (
                <div className="results">
                  {isSongLane ? (
                    <>
                      <div className="results-song-stack">
                        <KeyDisplay result={keyDetection} />
                      </div>
                      <div className="results-summary">
                        <ChordDisplay chordName={chord} onChordSelect={handleChordSelect} />
                        <NoteDisplay
                          notes={uniqueNotes}
                          onNoteClick={(note) => {
                            void midiPlayback.previewNote(note);
                          }}
                        />
                      </div>
                      <ChordTimeline events={chordTimeline} onChordSelect={handleChordSelect} />
                      <PianoRoll
                        notes={notes}
                        isPlaying={midiPlayback.isPlaying}
                        currentTimeS={midiPlayback.currentTimeS}
                        durationS={midiPlayback.duration}
                        onPlay={midiPlayback.play}
                        onStop={midiPlayback.stop}
                      />
                      <Suspense fallback={<ExportPanelFallback />}>
                        <LazyExportPanel {...exportPanelProps} />
                      </Suspense>
                    </>
                  ) : (
                    <>
                      <div className="results-summary results-summary--chord-lane">
                        <div className="chord-lane-visualization">
                          <ChordDisplay chordName={displayedChord} onChordSelect={handleChordSelect} />
                          {variateSuggestions.length > 0 && (
                            <div className="variate-suggestions">
                              <span className="variate-suggestions__label">Try substituting:</span>
                              <div className="variate-suggestions__list">
                                {variateSuggestions.map((suggestion) => (
                                  <button
                                    key={suggestion.name}
                                    type="button"
                                    className={`variate-btn ${variateOverride === suggestion.name ? "active" : ""}`}
                                    onClick={() => setVariateOverride(suggestion.name)}
                                    title={`${suggestion.type}: ${suggestion.description}`}
                                  >
                                    {suggestion.name}
                                  </button>
                                ))}
                                {variateOverride && (
                                  <button
                                    type="button"
                                    className="variate-btn variate-btn--clear"
                                    onClick={() => setVariateOverride(null)}
                                    title="Clear substitution"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="chord-lane-panel" aria-live="polite">
                          {activeVoicing ? (
                            <>
                              <div className="chord-lane-panel__header">
                                <div>
                                  <span className="chord-lane-panel__kicker">Guitar shape</span>
                                  <h3>{displayedChord ?? "Detected chord"}</h3>
                                  <p>
                                    Shape {activeVoicingIndex + 1} of {chordVoicings.length}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="analyze-btn analyze-btn--secondary"
                                  onClick={handleNextVoicing}
                                  disabled={chordVoicings.length <= 1}
                                >
                                  Next shape
                                </button>
                              </div>
                              <Suspense
                                fallback={<ChordFretboardFallback chordName={displayedChord} />}
                              >
                                <LazyChordFretboard
                                  chordName={displayedChord}
                                  voicing={activeVoicing}
                                />
                              </Suspense>
                            </>
                          ) : (
                            <div className="lane-placeholder">
                              <span className="lane-placeholder__kicker">Guitar shape</span>
                              <h3>No guitar shape yet</h3>
                              <p>This chord does not have a saved guitar shape yet.</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <NoteDisplay
                        notes={uniqueNotes}
                        onNoteClick={(note) => {
                          void midiPlayback.previewNote(note);
                        }}
                      />
                      <Suspense fallback={<ExportPanelFallback />}>
                        <LazyExportPanel {...exportPanelProps} />
                      </Suspense>
                    </>
                  )}
                </div>
              ) : (
                <div className="analysis-empty" aria-live="polite">
                  <span className="analysis-empty-icon" aria-hidden="true">♩</span>
                  <span className="analysis-empty-kicker">{activeWorkflow.emptyKicker}</span>
                  <p>{activeWorkflow.emptyBody}</p>
                </div>
              )}
            </div>
          </section>
        </main>

        <BuildBadge />
      </div>

      {showOnboarding && (
        <OnboardingSheet
          onClose={() => setShowOnboarding(false)}
          showStorageHint={showStorageEvictionPrompt}
        />
      )}

      {selectedChordName && (
        <Suspense
          fallback={
            <SelectedChordDialogFallback
              chord={selectedChordName}
              context={selectedChordContext ?? undefined}
              onClose={handleCloseSelectedChord}
            />
          }
        >
          <LazySelectedChordDialog
            chord={selectedChordName}
            context={selectedChordContext ?? undefined}
            voicingIndex={selectedChordVoicingIndex}
            onVoicingChange={setSelectedChordVoicingIndex}
            onClose={handleCloseSelectedChord}
          />
        </Suspense>
      )}
    </div>
  );
}

interface TunerRouteProps {
  navigate: NavigateToRoute;
}

function TunerRoute({ navigate }: TunerRouteProps) {
  return (
    <div className="app">
      <div className="app-shell app-shell--single">
        <header className="app-header">
          <div className="app-header-main">
            <AppTitle navigate={navigate} />
            <nav className="app-header-actions" aria-label="Primary">
              <AppRouteLink className="app-nav-link" to={HOME_PATH} navigate={navigate}>
                Back to Riff
              </AppRouteLink>
            </nav>
          </div>
          <p className="tagline">Tune up quickly without loading the recording workspace.</p>
        </header>

        <main className="tuner-page">
          <div className="workspace-pane__intro tuner-page__intro">
            <span className="workspace-pane__kicker">Utility</span>
            <h2 className="workspace-pane__title">Guitar tuner</h2>
            <p className="workspace-pane__description">
              A focused page for checking standard EADGBE tuning before capture.
            </p>
          </div>
          <GuitarTuner />
        </main>

        <BuildBadge />
      </div>
    </div>
  );
}

function App() {
  const { route, navigate } = useAppRoute();
  const [hasMountedWorkspace, setHasMountedWorkspace] = useState(() => route === "home");

  useEffect(() => {
    if (route === "home") {
      setHasMountedWorkspace(true);
    }
  }, [route]);

  const isWorkspaceActive = route === "home";
  const shouldMountWorkspace = hasMountedWorkspace || isWorkspaceActive;

  return (
    <>
      {shouldMountWorkspace && <RiffWorkspace isActive={isWorkspaceActive} navigate={navigate} />}
      {route === "tuner" && <TunerRoute navigate={navigate} />}
    </>
  );
}

export default App;
