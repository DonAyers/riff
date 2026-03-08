import { useState } from "react";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { usePitchDetection } from "./hooks/usePitchDetection";
import { mapNoteEvents, getUniquePitchClasses, getUniqueNotes } from "./lib/noteMapper";
import { detectChord, formatChordName } from "./lib/chordDetector";
import { Recorder } from "./components/Recorder";
import { NoteDisplay } from "./components/NoteDisplay";
import { ChordDisplay } from "./components/ChordDisplay";
import { PianoRoll } from "./components/PianoRoll";
import { ProgressBar } from "./components/ProgressBar";
import type { MappedNote } from "./lib/noteMapper";
import "./styles/App.css";

function App() {
  const { state, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const { detect, isLoading, progress, error: detectionError } = usePitchDetection();

  const [notes, setNotes] = useState<MappedNote[]>([]);
  const [chord, setChord] = useState<string | null>(null);

  const handleStart = () => {
    setNotes([]);
    setChord(null);
    startRecording();
  };

  const handleStop = async () => {
    const audio = await stopRecording();
    if (!audio) return;

    const events = await detect(audio);
    const mapped = mapNoteEvents(events);
    setNotes(mapped);

    // Detect chord from unique pitch classes
    const pitchClasses = getUniquePitchClasses(mapped);
    const detected = detectChord(pitchClasses);
    setChord(detected ? formatChordName(detected) : null);
  };

  const uniqueNotes = getUniqueNotes(notes);
  const error = recorderError || detectionError;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Riff</h1>
        <p className="tagline">Play something. See every note.</p>
      </header>

      <main className="app-main">
        <Recorder
          state={isLoading ? "processing" : state}
          onStart={handleStart}
          onStop={handleStop}
          error={error}
        />

        <ProgressBar progress={progress} visible={isLoading} />

        {notes.length > 0 && (
          <div className="results">
            <ChordDisplay chordName={chord} />
            <NoteDisplay notes={uniqueNotes} />
            <PianoRoll notes={notes} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
