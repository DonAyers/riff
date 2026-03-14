import { useEffect, useState } from "react";
import { HelpCircle, FlaskConical } from "lucide-react";
import { useRiffSession } from "./hooks/useRiffSession";
import { Recorder } from "./components/Recorder";
import { LaneToggle, type Lane } from "./components/LaneToggle";
import { KeyDisplay } from "./components/KeyDisplay";
import { ChordTimeline } from "./components/ChordTimeline";
import { ChordFretboard } from "./components/ChordFretboard";
import { NoteDisplay } from "./components/NoteDisplay";
import { ChordDisplay } from "./components/ChordDisplay";
import { PianoRoll } from "./components/PianoRoll";
import { ProgressBar } from "./components/ProgressBar";
import { Playback } from "./components/Playback";
import { SessionPicker } from "./components/SessionPicker";
import { ExportPanel } from "./components/ExportPanel";
import { OnboardingSheet, hasSeenOnboarding } from "./components/OnboardingSheet";
import { SelectedChordDialog } from "./components/SelectedChordDialog";
import { lookupVoicings } from "./lib/chordVoicings";
import { getVariateSuggestions } from "./lib/chordSubstitutions";
import type { ChordEvent } from "./lib/chordDetector";
import "./styles/App.css";

const APP_SUBTITLE = "Capture an idea, then review the notes or chords in one place.";

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

function App() {
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const [activeLane, setActiveLane] = useState<Lane>("song");
  const [activeVoicingIndex, setActiveVoicingIndex] = useState(0);
  const [selectedChordName, setSelectedChordName] = useState<string | null>(null);
  const [selectedChordContext, setSelectedChordContext] = useState<ChordEvent | null>(null);
  const [selectedChordVoicingIndex, setSelectedChordVoicingIndex] = useState(0);
  const [variateOverride, setVariateOverride] = useState<string | null>(null);
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

  return (
    <div className="app">
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-main">
            <h1><i className="note-icon">♪</i> Riff</h1>
            <button
              className="help-btn"
              onClick={() => setShowOnboarding(true)}
              aria-label="Help and about"
            >
              <HelpCircle size={18} strokeWidth={1.8} />
            </button>
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
                      <PianoRoll notes={notes} />
                      <ExportPanel
                        notes={notes}
                        pcmAudio={pendingAudio}
                        compressedBlob={compressedBlob}
                        compressedMime={compressedMime}
                        riffName={activeRiffName}
                        visible={hasResults}
                      />
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
                              <ChordFretboard chordName={displayedChord} voicing={activeVoicing} />
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
                      <ExportPanel
                        notes={notes}
                        pcmAudio={pendingAudio}
                        compressedBlob={compressedBlob}
                        compressedMime={compressedMime}
                        riffName={activeRiffName}
                        visible={hasResults}
                      />
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
      </div>

      {showOnboarding && (
        <OnboardingSheet onClose={() => setShowOnboarding(false)} />
      )}

      {selectedChordName && (
        <SelectedChordDialog
          chord={selectedChordName}
          context={selectedChordContext ?? undefined}
          voicingIndex={selectedChordVoicingIndex}
          onVoicingChange={setSelectedChordVoicingIndex}
          onClose={handleCloseSelectedChord}
        />
      )}
    </div>
  );
}

export default App;
