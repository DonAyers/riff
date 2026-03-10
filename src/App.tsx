import { useRiffSession } from "./hooks/useRiffSession";
import { Recorder } from "./components/Recorder";
import { NoteDisplay } from "./components/NoteDisplay";
import { ChordDisplay } from "./components/ChordDisplay";
import { PianoRoll } from "./components/PianoRoll";
import { ProgressBar } from "./components/ProgressBar";
import { Playback } from "./components/Playback";
import { SavedRiffs } from "./components/SavedRiffs";
import { ExportPanel } from "./components/ExportPanel";
import { buildLabel } from "./lib/buildInfo";
import "./styles/App.css";

function App() {
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
          <h1><i className="note-icon">♪</i> Riff</h1>
          <p className="tagline">Capture a take. Hear what you played.</p>
        </header>

        <main className="app-main">
          <section className="workspace-pane workspace-pane--capture" aria-labelledby="capture-workspace-title">
            <div className="pane-header">
              <p className="pane-kicker">Capture</p>
              <h2 id="capture-workspace-title">Record a take or import audio</h2>
              <p className="pane-copy">
                Start with a live recording or bring in a file to hear the notes and chord.
              </p>
            </div>

            <div className="recorder-card">
              <Recorder
                state={isLoading ? "processing" : recorderState}
                onStart={handleStart}
                onStop={() => void handleStop()}
                onImport={(file) => void handleImport(file)}
                isImporting={isImporting}
                error={error}
              />

              <div className="recorder-actions">
                <label className="auto-process-toggle">
                  <input
                    type="checkbox"
                    checked={autoProcess}
                    onChange={(e) => setAutoProcess(e.target.checked)}
                    disabled={recorderState !== "idle" || isLoading}
                  />
                  Detect notes after recording
                </label>

                <label className="storage-format-toggle">
                  <input
                    type="checkbox"
                    checked={storageFormat === "compressed"}
                    onChange={(e) => setStorageFormat(e.target.checked ? "compressed" : "pcm")}
                    disabled={recorderState !== "idle" || isLoading}
                  />
                  Compress saved takes
                </label>

                <div className="recorder-button-row">
                  <button
                    className="analyze-btn"
                    onClick={() => {
                      void handleAnalyze();
                    }}
                    disabled={
                      autoProcess || !hasPendingAnalysis || isLoading || recorderState !== "idle"
                    }
                  >
                    Detect Notes
                  </button>

                  {error && !hasResults && (
                    <button
                      className="analyze-btn analyze-btn--secondary"
                      onClick={handleLoadDemoAnalysis}
                      disabled={isLoading || recorderState !== "idle"}
                    >
                      Try Demo Take
                    </button>
                  )}
                </div>
              </div>

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
                  label="Preview"
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

          <section className="workspace-pane workspace-pane--analysis" aria-labelledby="analysis-workspace-title">
            <div className="analysis-panel">
              <div className="pane-header pane-header--analysis">
                <p className="pane-kicker">Analyze</p>
                <h2 id="analysis-workspace-title">Notes, chord, and timing</h2>
                <p className="pane-copy">
                  Review what the app heard in your latest take.
                </p>
              </div>

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
                  <span className="analysis-empty-kicker">Ready for a take</span>
                  <p>Record a take or import audio to see the notes, chord, and timing here.</p>
                </div>
              )}
            </div>
          </section>
        </main>

        <div className="build-badge" aria-label={`Build ${buildLabel}`} title={`Build ${buildLabel}`}>
          {buildLabel}
        </div>
      </div>
    </div>
  );
}

export default App;
