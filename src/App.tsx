import { useState } from "react";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { usePitchDetection } from "./hooks/usePitchDetection";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useMidiPlayback } from "./hooks/useMidiPlayback";
import { mapNoteEvents, getUniquePitchClasses, getUniqueNotes } from "./lib/noteMapper";
import { detectChord, formatChordName } from "./lib/chordDetector";
import { Recorder } from "./components/Recorder";
import { NoteDisplay } from "./components/NoteDisplay";
import { ChordDisplay } from "./components/ChordDisplay";
import { PianoRoll } from "./components/PianoRoll";
import { ProgressBar } from "./components/ProgressBar";
import { Playback } from "./components/Playback";
import type { MappedNote } from "./lib/noteMapper";
import "./styles/App.css";

function App() {
  const { state, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const { detect, isLoading, progress, error: detectionError } = usePitchDetection();
  const { load: loadPlayback, play, pause, isPlaying, duration } = useAudioPlayback();
  const {
    load: loadMidiPlayback,
    play: playMidi,
    stop: stopMidi,
    isPlaying: isMidiPlaying,
    duration: midiDuration,
  } = useMidiPlayback();

  const [notes, setNotes] = useState<MappedNote[]>([]);
  const [chord, setChord] = useState<string | null>(null);
  const [hasRecording, setHasRecording] = useState(false);

  const handleStart = () => {
    setNotes([]);
    setChord(null);
    setHasRecording(false);
    stopMidi();
    startRecording();
  };

  const handleStop = async () => {
    const audio = await stopRecording();
    if (!audio) return;

    loadPlayback(audio);
    setHasRecording(true);

    const events = await detect(audio);
    const mapped = mapNoteEvents(events);
    setNotes(mapped);
    loadMidiPlayback(mapped);

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

        <Playback
          label="Original"
          isPlaying={isPlaying}
          duration={duration}
          onPlay={play}
          onPause={pause}
          visible={hasRecording && !isLoading}
        />

        <Playback
          label="MIDI"
          isPlaying={isMidiPlaying}
          duration={midiDuration}
          onPlay={playMidi}
          onPause={stopMidi}
          visible={notes.length > 0 && !isLoading}
        />

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
