import { useRiffSession } from "./hooks/useRiffSession";
import { Recorder } from "./components/Recorder";
import { NoteDisplay } from "./components/NoteDisplay";
import { ChordDisplay } from "./components/ChordDisplay";
import { PianoRoll } from "./components/PianoRoll";
import { ProgressBar } from "./components/ProgressBar";
import { Playback } from "./components/Playback";
import { SavedRiffs } from "./components/SavedRiffs";
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
    savedRiffs,
    handleLoadSavedRiff,
    audioPlayback,
    midiPlayback,
  } = useRiffSession();

  return (
    <div className="app">
      <header className="app-header">
        <h1><i className="note-icon">♪</i> Riff</h1>
        <p className="tagline">Capture your musical ideas</p>
      </header>

      <main className="app-main">
        <div className="recorder-card">
          <Recorder
            state={isLoading ? "processing" : recorderState}
            onStart={handleStart}
            onStop={() => void handleStop()}
            error={error}
          />

          <label className="auto-process-toggle">
            <input
              type="checkbox"
              checked={autoProcess}
              onChange={(e) => setAutoProcess(e.target.checked)}
              disabled={recorderState !== "idle" || isLoading}
            />
            Auto-process after recording
          </label>

          <button
            className="analyze-btn"
            onClick={() => {
              void handleAnalyze();
            }}
            disabled={
              autoProcess || !hasPendingAnalysis || isLoading || recorderState !== "idle"
            }
          >
            Analyze Clip
          </button>

          {error && notes.length === 0 && (
            <button
              className="analyze-btn"
              onClick={handleLoadDemoAnalysis}
              disabled={isLoading || recorderState !== "idle"}
            >
              Load Demo Analysis
            </button>
          )}

          <ProgressBar progress={progress} visible={isLoading} />
        </div>

        <Playback
          label="Original"
          isPlaying={audioPlayback.isPlaying}
          duration={audioPlayback.duration}
          onPlay={audioPlayback.play}
          onPause={audioPlayback.pause}
          visible={hasRecording && !isLoading}
        />

        <Playback
          label="MIDI"
          isPlaying={midiPlayback.isPlaying}
          duration={midiPlayback.duration}
          onPlay={midiPlayback.play}
          onPause={midiPlayback.stop}
          visible={notes.length > 0 && !isLoading}
        />

        {notes.length > 0 && (
          <div className="results" style={{width: "100%"}}>
            <ChordDisplay chordName={chord} />
            <NoteDisplay
              notes={uniqueNotes}
              onNoteClick={(note) => {
                void midiPlayback.previewNote(note.midi, note.amplitude);
              }}
            />
            <PianoRoll notes={notes} />
          </div>
        )}

        <SavedRiffs riffs={savedRiffs} onLoad={handleLoadSavedRiff} />
      </main>
    </div>
  );
}

export default App;
