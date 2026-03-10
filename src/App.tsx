import { useState } from "react";
import { HelpCircle, FlaskConical } from "lucide-react";
import { useRiffSession } from "./hooks/useRiffSession";
import { Recorder } from "./components/Recorder";
import { NoteDisplay } from "./components/NoteDisplay";
import { ChordDisplay } from "./components/ChordDisplay";
import { PianoRoll } from "./components/PianoRoll";
import { ProgressBar } from "./components/ProgressBar";
import { Playback } from "./components/Playback";
import { SavedRiffs } from "./components/SavedRiffs";
import { ExportPanel } from "./components/ExportPanel";
import { OnboardingSheet, hasSeenOnboarding } from "./components/OnboardingSheet";
import { buildLabel } from "./lib/buildInfo";
import "./styles/App.css";

const TAGLINES = [
  "Every riff, decoded.",
  "Just record it. Frig.",
  "May the frig be with you.",
  "The red light is not judging you.",
  "One more take. For real this time.",
];

const tagline = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

function App() {
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
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
    handleLoadSavedRiff,
    audioPlayback,
    midiPlayback,
    pendingAudio,
    activeRiffName,
    compressedBlob,
    compressedMime,
  } = useRiffSession();

  const hasResults = notes.length > 0;
  const showPlaybackStack = !isLoading && (hasRecording || hasResults);

  return (
    <div className="app">
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-main">
            <h1><i className="note-icon">♪</i> Riff</h1>
            <button
              className="help-btn"
              onClick={() => setShowOnboarding(true)}
              aria-label="Help — how Riff works"
            >
              <HelpCircle size={18} strokeWidth={1.8} />
            </button>
          </div>
          <p className="tagline">{tagline}</p>
        </header>

        <main className="app-main">
          <section className="workspace-pane workspace-pane--capture" aria-label="Capture">
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
              <ProgressBar progress={progress} visible={isLoading} />
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

            <SavedRiffs riffs={savedRiffs} onLoad={handleLoadSavedRiff} />
          </section>

          <section className="workspace-pane workspace-pane--analysis" aria-label="Analysis">
            <div className="analysis-panel">
              {hasResults ? (
                <div className="results">
                  <div className="results-summary">
                    <ChordDisplay chordName={chord} />
                    <NoteDisplay
                      notes={uniqueNotes}
                      onNoteClick={(note) => {
                        void midiPlayback.previewNote(note.midi, note.amplitude);
                      }}
                    />
                  </div>
                  <PianoRoll notes={notes} />
                  <ExportPanel
                    notes={notes}
                    pcmAudio={pendingAudio}
                    compressedBlob={compressedBlob}
                    compressedMime={compressedMime}
                    riffName={activeRiffName}
                    visible={hasResults}
                  />
                </div>
              ) : (
                <div className="analysis-empty" aria-live="polite">
                  <span className="analysis-empty-icon" aria-hidden="true">♩</span>
                  <span className="analysis-empty-kicker">Nothing here yet</span>
                  <p>Record or import a take — notes, chord, and timeline will appear here.</p>
                </div>
              )}
            </div>
          </section>
        </main>

        <div className="build-badge" aria-label={`Build ${buildLabel}`} title={`Build ${buildLabel}`}>
          {buildLabel}
        </div>
      </div>

      {showOnboarding && (
        <OnboardingSheet onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}

export default App;
