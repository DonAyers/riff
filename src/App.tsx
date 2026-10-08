import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  FlaskConical,
  HelpCircle,
  Moon,
  RotateCcw,
  Settings,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useRiffSession } from "./hooks/useRiffSession";
import { Recorder } from "./components/Recorder";
import { LaneToggle, type Lane } from "./components/LaneToggle";
import { KeyDisplay } from "./components/KeyDisplay";
import { NoteDisplay } from "./components/NoteDisplay";
import { ChordDisplay } from "./components/ChordDisplay";
import { PianoRoll } from "./components/PianoRoll";
import { ProgressBar } from "./components/ProgressBar";
import { Playback } from "./components/Playback";
import { SessionPicker } from "./components/SessionPicker";
import { StorageEvictionPrompt } from "./components/StorageEvictionPrompt";
import { OnboardingSheet, hasSeenOnboarding } from "./components/OnboardingSheet";
import { AppTabBar } from "./components/AppTabBar";
import { lookupVoicings } from "./lib/chordVoicings";
import { getVariateSuggestions } from "./lib/chordSubstitutions";
import type { ChordEvent } from "./lib/chordDetector";
import { detectStorageEvictionRisk } from "./lib/storageEvictionRisk";
import { BUILDER_PATH, HOME_PATH, LOOPER_PATH, SETTINGS_PATH, TUNER_PATH } from "./lib/routes";
import { useGlobalKeyboardShortcuts } from "./hooks/useGlobalKeyboardShortcuts";
import { usePalettePreference } from "./hooks/usePalettePreference";
import { useThemePreference, type ThemeMode, type ThemeSource } from "./hooks/useThemePreference";
import type { ThemeChoice } from "./components/SettingsPanel";
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

// Each tab, and the analysis chord map, loads on first use so the Record screen's bundle
// stays small (research/spike-initial-load.md). The service worker precaches every chunk,
// so this costs nothing offline.
const LazyChordMapExplorer = lazy(async () => {
  const module = await import("./components/ChordMapExplorer");
  return { default: module.ChordMapExplorer };
});

const LazySongBuilder = lazy(async () => {
  const module = await import("./components/SongBuilder");
  return { default: module.SongBuilder };
});

const LazyGuitarTuner = lazy(async () => {
  const module = await import("./components/GuitarTuner");
  return { default: module.GuitarTuner };
});

const LazyLooper = lazy(async () => {
  const module = await import("./components/Looper");
  return { default: module.Looper };
});

const LazySettingsPanel = lazy(async () => {
  const module = await import("./components/SettingsPanel");
  return { default: module.SettingsPanel };
});

/** Holds the space while a lazily loaded screen arrives, and tells assistive tech why. */
function ScreenFallback() {
  return (
    <div className="screen-fallback" role="status" aria-live="polite">
      <span className="screen-fallback__label">Loading…</span>
    </div>
  );
}

const SKIP_DISCARD_CONFIRMATION_KEY = "riff:skip-discard-confirmation";

type WorkspaceRoute = "home" | "builder";
type AppRoute = WorkspaceRoute | "tuner" | "looper" | "settings";
type NavigateToRoute = (pathname: string) => void;
type HomeStage = "record" | "approve" | "analyze";
type AnalysisScreen = "summary" | "timeline" | "shape" | "export";

const CAPTURE_PANEL_COPY = {
  title: "Record",
  description: "Catch a riff, play it back, then decide if it deserves analysis.",
} as const;

const WORKFLOW_COPY = {
  song: {
    title: "Chord map",
    description: "Chord changes, shapes, variants, and timing show up here after approval.",
    emptyKicker: "No notes yet",
    emptyBody: "Approve a take from the record screen and Riff will map the chords here.",
  },
  chord: {
    title: "Analyze chords",
    description: "Key, chord changes, and playable guitar shapes show up here after approval.",
    emptyKicker: "No chords yet",
    emptyBody: "Approve a take from the record screen and Riff will listen for the harmony here.",
  },
} as const;

const ANALYSIS_LOADING_COPY = {
  song: {
    eyebrow: "Analysis in progress",
    label: "Mapping chords",
    description: "Riff is checking pitch, harmony, and timing now. The chord map will show up here.",
  },
  chord: {
    eyebrow: "Analysis in progress",
    label: "Checking the chords",
    description: "Riff is checking the key, chord changes, and playable guitar shapes. This panel will fill in here as soon as it is ready.",
  },
} as const;

const SWIPE_THRESHOLD_PX = 48;

function normalizePathname(pathname: string): string {
  const trimmedPathname = pathname.replace(/\/+$/, "");
  return trimmedPathname === "" ? HOME_PATH : trimmedPathname;
}

function resolveAppRoute(pathname: string): AppRoute {
  const normalized = normalizePathname(pathname);
  if (normalized === TUNER_PATH) return "tuner";
  if (normalized === BUILDER_PATH) return "builder";
  if (normalized === LOOPER_PATH) return "looper";
  if (normalized === SETTINGS_PATH) return "settings";
  return "home";
}

function getRoutePathname(route: AppRoute): string {
  if (route === "builder") return BUILDER_PATH;
  if (route === "looper") return LOOPER_PATH;
  if (route === "settings") return SETTINGS_PATH;
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

interface ThemeControls {
  nextTheme: ThemeMode;
  onToggle: () => void;
  source: ThemeSource;
  theme: ThemeMode;
}

function ThemeToggleButton({ nextTheme, onToggle, source, theme }: ThemeControls) {
  const Icon = nextTheme === "light" ? Sun : Moon;
  const currentSource =
    source === "system" ? `following system ${theme} mode` : `using saved ${theme} mode`;

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle--${theme}`}
      onClick={onToggle}
      aria-label={`Switch to ${nextTheme} mode, currently ${currentSource}`}
      aria-pressed={theme === "light"}
      title={`Switch to ${nextTheme} mode (${currentSource})`}
    >
      <Icon size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  );
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
        Riff
        <span className="app-title-dot" aria-hidden="true" />
      </AppRouteLink>
    </h1>
  );
}

interface AppHeaderProps {
  navigate: NavigateToRoute;
  themeControls: ThemeControls;
  onHelp?: () => void;
}

/** The one header every tab shares: wordmark on the left, theme, settings and help on the right. */
function AppHeader({ navigate, themeControls, onHelp }: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-main">
        <AppTitle navigate={navigate} />
        <div className="app-header-actions">
          <ThemeToggleButton {...themeControls} />
          <AppRouteLink
            className="settings-btn"
            to={SETTINGS_PATH}
            navigate={navigate}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={16} strokeWidth={2} aria-hidden="true" />
          </AppRouteLink>
          {onHelp && (
            <button className="help-btn" onClick={onHelp} aria-label="Help and about">
              <HelpCircle size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </header>
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
  activeRoute: WorkspaceRoute;
  isActive: boolean;
  navigate: NavigateToRoute;
  themeControls: ThemeControls;
}

function RiffWorkspace({ activeRoute, isActive, navigate, themeControls }: RiffWorkspaceProps) {
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const [homeStage, setHomeStage] = useState<HomeStage>("record");
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false);
  const [skipDiscardConfirmation, setSkipDiscardConfirmation] = useState(
    () => localStorage.getItem(SKIP_DISCARD_CONFIRMATION_KEY) === "true"
  );
  const [skipDiscardConfirmationDraft, setSkipDiscardConfirmationDraft] = useState(false);
  const [activeLane, setActiveLane] = useState<Lane>("song");
  const [analysisScreen, setAnalysisScreen] = useState<AnalysisScreen>("summary");
  const [shouldFocusExport, setShouldFocusExport] = useState(false);
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
    handleDiscardRecording,
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
  const swipeStartXRef = useRef<number | null>(null);
  const swipeStartYRef = useRef<number | null>(null);
  const setExportShortcutTarget = useCallback((element: HTMLButtonElement | null) => {
    exportShortcutTargetRef.current = element;

    if (element && shouldFocusExport && analysisScreen === "export") {
      element.focus();
      setShouldFocusExport(false);
    }
  }, [analysisScreen, shouldFocusExport]);
  const exportPanelProps = {
    notes,
    pcmAudio: pendingAudio,
    pcmSampleRate: pendingAudioSampleRate,
    compressedBlob,
    compressedMime,
    riffName: activeRiffName,
    visible: hasResults,
    shortcutTargetRef: setExportShortcutTarget,
  } as const;

  const stopRecordingForHomeReview = useCallback(() => {
    void handleStop({ analyze: false });
  }, [handleStop]);

  const handleStartHomeTake = useCallback(() => {
    setShowDiscardConfirmation(false);
    setHomeStage("record");
    handleStart();
  }, [handleStart]);

  const handleApproveTake = useCallback(() => {
    setShowDiscardConfirmation(false);
    setHomeStage("analyze");
    setAnalysisScreen("summary");
    void handleAnalyze();
  }, [handleAnalyze]);

  const performDiscardTake = useCallback((rememberPreference: boolean) => {
    if (rememberPreference) {
      localStorage.setItem(SKIP_DISCARD_CONFIRMATION_KEY, "true");
      setSkipDiscardConfirmation(true);
    }

    handleDiscardRecording();
    setSkipDiscardConfirmationDraft(false);
    setShowDiscardConfirmation(false);
    setHomeStage("record");
  }, [handleDiscardRecording]);

  const handleRejectTake = useCallback(() => {
    if (skipDiscardConfirmation) {
      performDiscardTake(false);
      return;
    }

    setSkipDiscardConfirmationDraft(false);
    setShowDiscardConfirmation(true);
  }, [performDiscardTake, skipDiscardConfirmation]);

  const handleLoadSavedRiffForFlow = useCallback((session: Parameters<typeof handleLoadSavedRiff>[0]) => {
    void handleLoadSavedRiff(session);
    setShowDiscardConfirmation(false);
    setHomeStage("analyze");
    setAnalysisScreen("summary");
  }, [handleLoadSavedRiff]);

  const handleLaneChange = useCallback((lane: Lane) => {
    setActiveLane(lane);
    setAnalysisScreen("summary");
  }, []);

  const baseRecorderProps = {
    state: isLoading ? "processing" : recorderState,
    onStart: handleStart,
    onStop: () => void handleStop(),
    onImport: (file: File) => void handleImport(file),
    isImporting,
    error,
    autoProcess,
    onAutoProcessChange: setAutoProcess,
    storageFormat,
    onStorageFormatChange: (v: "pcm" | "compressed") => setStorageFormat(v),
    recorderState,
    isLoading,
    hasPendingAnalysis,
    onAnalyze: () => void handleAnalyze(),
    profileId,
    onProfileChange: setProfileId,
  } as const;

  const homeRecorderProps = {
    ...baseRecorderProps,
    onStart: handleStartHomeTake,
    onStop: stopRecordingForHomeReview,
    onAnalyze: handleApproveTake,
    showSettings: false,
    showAnalyzeAction: false,
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
    if (activeRoute !== "home") return;

    const hasResults = notes.length > 0;
    if (isLoading || hasResults) {
      setHomeStage("analyze");
      setShowDiscardConfirmation(false);
      if (isLoading) {
        setAnalysisScreen("summary");
      }
      return;
    }

    if (hasRecording && hasPendingAnalysis) {
      setHomeStage("approve");
      return;
    }

    if (!hasRecording && !hasPendingAnalysis && recorderState === "idle") {
      setHomeStage("record");
      setShowDiscardConfirmation(false);
    }
  }, [activeRoute, hasPendingAnalysis, hasRecording, isLoading, notes.length, recorderState]);

  useEffect(() => {
    setActiveVoicingIndex(0);
    setVariateOverride(null);
    setSelectedChordName(null);
    setSelectedChordContext(null);
    setSelectedChordVoicingIndex(0);
    setAnalysisScreen("summary");
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

  const analysisScreens: Array<{ id: AnalysisScreen; label: string }> = isSongLane
    ? [
        { id: "summary", label: "Chords" },
        { id: "timeline", label: "Notes" },
        { id: "export", label: "Export" },
      ]
    : [
        { id: "summary", label: "Chord" },
        { id: "shape", label: "Shape" },
        { id: "export", label: "Export" },
      ];

  const moveAnalysisScreen = useCallback((direction: 1 | -1) => {
    setAnalysisScreen((current) => {
      const screens = activeLane === "song"
        ? ["summary", "timeline", "export"]
        : ["summary", "shape", "export"];
      const currentIndex = screens.indexOf(current);
      const safeIndex = currentIndex === -1 ? 0 : currentIndex;
      const nextIndex = Math.min(Math.max(safeIndex + direction, 0), screens.length - 1);
      return screens[nextIndex] as AnalysisScreen;
    });
  }, [activeLane]);

  const handleFlowPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    swipeStartXRef.current = event.clientX;
    swipeStartYRef.current = event.clientY;
  };

  const handleFlowPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const startX = swipeStartXRef.current;
    const startY = swipeStartYRef.current;
    swipeStartXRef.current = null;
    swipeStartYRef.current = null;

    if (startX === null || startY === null) return;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) {
      return;
    }

    if (homeStage === "analyze" && hasResults) {
      moveAnalysisScreen(deltaX < 0 ? 1 : -1);
      return;
    }

    if (homeStage === "approve") {
      if (deltaX < 0) {
        handleApproveTake();
      } else {
        handleRejectTake();
      }
    }
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
    if (activeRoute === "home") {
      setAnalysisScreen("export");
      setShouldFocusExport(true);
      return;
    }

    exportShortcutTargetRef.current?.focus();
  }, [activeRoute]);

  useEffect(() => {
    if (!shouldFocusExport || analysisScreen !== "export") return;
    if (!exportShortcutTargetRef.current) return;
    exportShortcutTargetRef.current.focus();
    setShouldFocusExport(false);
  }, [analysisScreen, shouldFocusExport]);

  useGlobalKeyboardShortcuts({
    disabled: !isActive || showOnboarding || selectedChordName !== null,
    handlers: {
      record: {
        enabled: recorderState === "recording" || (!isLoading && !isImporting && recorderState === "idle"),
        run: () => {
          if (recorderState === "recording") {
            void handleStop({ analyze: activeRoute === "home" ? false : undefined });
            return;
          }

          if (recorderState === "idle") {
            if (activeRoute === "home") {
              handleStartHomeTake();
              return;
            }

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
          if (activeRoute === "home") {
            handleApproveTake();
            return;
          }

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
    <div
      className={[
        "app",
        activeRoute === "home" ? "app--flow" : "",
        activeRoute === "builder" ? "app--builder" : "",
      ].filter(Boolean).join(" ")}
      data-testid="riff-workspace"
      hidden={!isActive}
    >
      <div className={`app-shell ${activeRoute === "builder" ? "app-shell--builder" : ""}`}>
        {activeRoute === "builder" && (
          <AppHeader
            navigate={navigate}
            themeControls={themeControls}
            onHelp={() => setShowOnboarding(true)}
          />
        )}

        <main className={`app-main ${activeRoute === "builder" ? "app-main--builder" : "app-main--flow"}`}>
          {activeRoute === "builder" ? (
            <Suspense fallback={<ScreenFallback />}>
              <LazySongBuilder
                chordTimeline={chordTimeline}
                recorderProps={baseRecorderProps}
                isLoading={isLoading}
                progress={progress}
                onLoadDemo={handleLoadDemoAnalysis}
                showDemoFallback={Boolean(error && !hasResults)}
              />
            </Suspense>
          ) : (
            <section
              className={`riff-device riff-device--${homeStage}`}
              aria-label="Riff recorder"
              onPointerDown={handleFlowPointerDown}
              onPointerUp={handleFlowPointerUp}
            >
              <AppHeader
                navigate={navigate}
                themeControls={themeControls}
                onHelp={() => setShowOnboarding(true)}
              />

              <h2 className="riff-device__stage-title">
                {homeStage === "record" && CAPTURE_PANEL_COPY.title}
                {homeStage === "approve" && "Take check"}
                {homeStage === "analyze" && activeWorkflow.title}
              </h2>

              {homeStage === "record" && (
                <section className="app-screen app-screen--record" aria-label="Capture" data-testid="stage-record">
                  <div className="workspace-pane__intro">
                    <p className="workspace-pane__description">{CAPTURE_PANEL_COPY.description}</p>
                  </div>
                  <div className="recorder-card">
                    <Recorder {...homeRecorderProps} />
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
                  </div>
                </section>
              )}

              {homeStage === "approve" && (
                <section className="app-screen app-screen--approve" aria-label="Approve take" data-testid="stage-approve">
                  <div className="take-card">
                    <h2>Keep this take?</h2>
                    <p>Listen once. If the idea is there, send it to chord analysis. If not, toss it and record again.</p>
                    <Playback
                      label="Recording"
                      isPlaying={audioPlayback.isPlaying}
                      duration={audioPlayback.duration}
                      onPlay={audioPlayback.play}
                      onPause={audioPlayback.pause}
                      visible={hasRecording}
                    />
                    <div className="take-actions" aria-label="Take approval">
                      <button type="button" className="take-action take-action--reject" onClick={handleRejectTake}>
                        <ThumbsDown size={20} strokeWidth={2.2} aria-hidden="true" />
                        Retake
                      </button>
                      <button type="button" className="take-action take-action--approve" onClick={handleApproveTake}>
                        <ThumbsUp size={20} strokeWidth={2.2} aria-hidden="true" />
                        Analyze
                      </button>
                    </div>
                  </div>

                  {showDiscardConfirmation && (
                    <div className="discard-callout" role="alertdialog" aria-label="Delete this take">
                      <div>
                        <h3>Delete this take?</h3>
                        <p>This only clears the current recording. Saved riffs stay in your library.</p>
                      </div>
                      <label className="discard-callout__checkbox">
                        <input
                          type="checkbox"
                          checked={skipDiscardConfirmationDraft}
                          onChange={(event) => setSkipDiscardConfirmationDraft(event.target.checked)}
                        />
                        <span>Next time, retake immediately</span>
                      </label>
                      <div className="discard-callout__actions">
                        <button
                          type="button"
                          className="analyze-btn analyze-btn--secondary"
                          onClick={() => setShowDiscardConfirmation(false)}
                        >
                          Keep take
                        </button>
                        <button
                          type="button"
                          className="analyze-btn analyze-btn--danger"
                          onClick={() => performDiscardTake(skipDiscardConfirmationDraft)}
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {homeStage === "analyze" && (
                <section className="app-screen app-screen--analysis" aria-label="Analysis" data-testid="stage-analyze">
                  <div className="analysis-panel">
                    <div className="analysis-panel__header">
                      <div className="analysis-panel__intro">
                        <p className="analysis-panel__description">{activeWorkflow.description}</p>
                      </div>
                      <LaneToggle activeLane={activeLane} onChange={handleLaneChange} />
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
                          Keep this screen open. The chord map drops in as soon as the pass finishes.
                        </p>
                      </div>
                    ) : hasResults ? (
                      <div className="results">
                        <nav className="analysis-screen-nav" aria-label="Analysis screens">
                          {analysisScreens.map((screen) => (
                            <button
                              key={screen.id}
                              type="button"
                              className={`analysis-screen-nav__button ${analysisScreen === screen.id ? "active" : ""}`}
                              aria-current={analysisScreen === screen.id ? "step" : undefined}
                              onClick={() => setAnalysisScreen(screen.id)}
                            >
                              {screen.label}
                            </button>
                          ))}
                        </nav>

                        {isSongLane ? (
                          <div className={`analysis-screen analysis-screen--${analysisScreen}`}>
                            {analysisScreen === "summary" && (
                              <>
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
                                <div className="results-song-stack">
                                  <KeyDisplay result={keyDetection} />
                                </div>
                                <Suspense fallback={<ScreenFallback />}>
                                  <LazyChordMapExplorer
                                    events={chordTimeline}
                                    fallbackChord={chord}
                                    onOpenChord={handleChordSelect}
                                  />
                                </Suspense>
                              </>
                            )}

                            {analysisScreen === "timeline" && (
                              <>
                                <NoteDisplay
                                  notes={uniqueNotes}
                                  onNoteClick={(note) => {
                                    void midiPlayback.previewNote(note);
                                  }}
                                />
                                <PianoRoll
                                  notes={notes}
                                  isPlaying={midiPlayback.isPlaying}
                                  currentTimeS={midiPlayback.currentTimeS}
                                  durationS={midiPlayback.duration}
                                  onPlay={midiPlayback.play}
                                  onStop={midiPlayback.stop}
                                />
                              </>
                            )}

                            {analysisScreen === "export" && (
                              <>
                                {showPlaybackStack && (
                                  <div className="playback-stack" aria-label="Playback controls">
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
                                <Suspense fallback={<ExportPanelFallback />}>
                                  <LazyExportPanel {...exportPanelProps} />
                                </Suspense>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className={`analysis-screen analysis-screen--${analysisScreen}`}>
                            {analysisScreen === "summary" && (
                              <>
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
                                <NoteDisplay
                                  notes={uniqueNotes}
                                  onNoteClick={(note) => {
                                    void midiPlayback.previewNote(note);
                                  }}
                                />
                              </>
                            )}

                            {analysisScreen === "shape" && (
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
                            )}

                            {analysisScreen === "export" && (
                              <Suspense fallback={<ExportPanelFallback />}>
                                <LazyExportPanel {...exportPanelProps} />
                              </Suspense>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="analysis-empty" aria-live="polite">
                        <span className="analysis-empty-icon" aria-hidden="true">♩</span>
                        <span className="analysis-empty-kicker">{activeWorkflow.emptyKicker}</span>
                        <p>{activeWorkflow.emptyBody}</p>
                        <button
                          type="button"
                          className="analyze-btn analyze-btn--secondary"
                          onClick={() => setHomeStage("record")}
                        >
                          <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
                          Record again
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              <div className="riff-device__library">
                <SessionPicker
                  sessions={savedRiffs}
                  activeSessionId={activeSessionId}
                  onLoad={handleLoadSavedRiffForFlow}
                  onDelete={handleDeleteSession}
                />
                {showStorageEvictionPrompt && savedRiffs.length > 0 && (
                  <StorageEvictionPrompt />
                )}
              </div>
            </section>
          )}
        </main>

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

interface ToolRouteProps {
  navigate: NavigateToRoute;
  themeControls: ThemeControls;
  title: string;
  description: string;
  children: ReactNode;
}

function ToolRoute({ navigate, themeControls, title, description, children }: ToolRouteProps) {
  return (
    <div className="app">
      <div className="app-shell app-shell--single">
        <AppHeader navigate={navigate} themeControls={themeControls} />

        <main className="tuner-page">
          <div className="workspace-pane__intro tuner-page__intro">
            <h2 className="workspace-pane__title">{title}</h2>
            <p className="workspace-pane__description">{description}</p>
          </div>
          <Suspense fallback={<ScreenFallback />}>{children}</Suspense>
        </main>

      </div>
    </div>
  );
}

function App() {
  const { route, navigate } = useAppRoute();
  const themePreference = useThemePreference();
  const { palette, setPalette, customPalette, setCustomPalette } = usePalettePreference();
  const { clearThemeOverride, setThemeOverride } = themePreference;
  const handleThemeChoice = useCallback(
    (choice: ThemeChoice) => {
      if (choice === "system") clearThemeOverride();
      else setThemeOverride(choice);
    },
    [clearThemeOverride, setThemeOverride]
  );
  const themeControls: ThemeControls = {
    nextTheme: themePreference.nextTheme,
    onToggle: themePreference.toggleTheme,
    source: themePreference.source,
    theme: themePreference.theme,
  };
  const isWorkspaceRoute = route === "home" || route === "builder";
  const [hasMountedWorkspace, setHasMountedWorkspace] = useState(() => isWorkspaceRoute);
  const [workspaceRoute, setWorkspaceRoute] = useState<WorkspaceRoute>(() =>
    route === "builder" ? "builder" : "home"
  );

  useEffect(() => {
    if (isWorkspaceRoute) {
      setHasMountedWorkspace(true);
      setWorkspaceRoute(route);
    }
  }, [isWorkspaceRoute, route]);

  const isWorkspaceActive = isWorkspaceRoute;
  const shouldMountWorkspace = hasMountedWorkspace || isWorkspaceActive;

  return (
    <>
      {shouldMountWorkspace && (
        <RiffWorkspace
          activeRoute={workspaceRoute}
          isActive={isWorkspaceActive}
          navigate={navigate}
          themeControls={themeControls}
        />
      )}
      {route === "tuner" && (
        <ToolRoute
          navigate={navigate}
          themeControls={themeControls}
          title="Guitar tuner"
          description="Pick a tuning, pluck one string, and follow the note."
        >
          <LazyGuitarTuner />
        </ToolRoute>
      )}
      {route === "looper" && (
        <ToolRoute
          navigate={navigate}
          themeControls={themeControls}
          title="Looper"
          description="Lay down a loop, then stack up to three more parts on top."
        >
          <LazyLooper />
        </ToolRoute>
      )}
      {route === "settings" && (
        <ToolRoute
          navigate={navigate}
          themeControls={themeControls}
          title="Settings"
          description="Choose how Riff looks on this device."
        >
          <LazySettingsPanel
            palette={palette}
            onPaletteChange={setPalette}
            customPalette={customPalette}
            onCustomPaletteChange={setCustomPalette}
            theme={themePreference.theme}
            themeSource={themePreference.source}
            onThemeChange={handleThemeChoice}
          />
        </ToolRoute>
      )}
      <AppTabBar activeTab={route === "settings" ? null : route} navigate={navigate} />
    </>
  );
}

export default App;
