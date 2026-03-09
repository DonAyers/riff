import { useEffect, useRef, useState, useCallback } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { usePitchDetection } from "./usePitchDetection";
import { useAudioPlayback } from "./useAudioPlayback";
import { useMidiPlayback } from "./useMidiPlayback";
import { mapNoteEvents, getUniquePitchClasses, getUniqueNotes } from "../lib/noteMapper";
import { detectChord, formatChordName } from "../lib/chordDetector";
import { listRiffs, saveRiff, type StoredRiff } from "../lib/db";
import { readPcmFromOpfs, savePcmToOpfs } from "../lib/audioStorage";
import type { MappedNote } from "../lib/noteMapper";

const DEMO_NOTES: MappedNote[] = [
  {
    midi: 60,
    name: "C4",
    pitchClass: "C",
    octave: 4,
    startTimeS: 0,
    durationS: 0.45,
    amplitude: 0.8,
  },
  {
    midi: 64,
    name: "E4",
    pitchClass: "E",
    octave: 4,
    startTimeS: 0.5,
    durationS: 0.45,
    amplitude: 0.78,
  },
  {
    midi: 67,
    name: "G4",
    pitchClass: "G",
    octave: 4,
    startTimeS: 1,
    durationS: 0.45,
    amplitude: 0.75,
  },
  {
    midi: 71,
    name: "B4",
    pitchClass: "B",
    octave: 4,
    startTimeS: 1.5,
    durationS: 0.45,
    amplitude: 0.73,
  },
  {
    midi: 72,
    name: "C5",
    pitchClass: "C",
    octave: 5,
    startTimeS: 2,
    durationS: 0.5,
    amplitude: 0.81,
  },
];

export function useRiffSession() {
  const { state, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const { detect, preload: preloadModel, isLoading, progress, error: detectionError } = usePitchDetection();
  
  const audioPlayback = useAudioPlayback();
  const midiPlayback = useMidiPlayback();

  const [notes, setNotes] = useState<MappedNote[]>([]);
  const [chord, setChord] = useState<string | null>(null);
  const [hasRecording, setHasRecording] = useState(false);
  const [hasPendingAnalysis, setHasPendingAnalysis] = useState(false);
  const [autoProcess, setAutoProcess] = useState(() => {
    const stored = localStorage.getItem("riff:auto-process");
    return stored === "true";
  });
  const [savedRiffs, setSavedRiffs] = useState<StoredRiff[]>([]);
  const pendingAudioRef = useRef<Float32Array | null>(null);

  // Preload the ML model when the session hooks mount
  useEffect(() => {
    preloadModel().catch(() => {
      // Model preload fail is fine, it will retry on detect
    });
  }, [preloadModel]);

  useEffect(() => {
    localStorage.setItem("riff:auto-process", autoProcess ? "true" : "false");
  }, [autoProcess]);

  useEffect(() => {
    listRiffs()
      .then((riffs) => setSavedRiffs(riffs))
      .catch(() => {
        // Ignore load errors
      });
  }, []);

  const handleStart = useCallback(() => {
    setNotes([]);
    setChord(null);
    setHasRecording(false);
    setHasPendingAnalysis(false);
    pendingAudioRef.current = null;
    midiPlayback.stop();
    startRecording();
  }, [midiPlayback, startRecording]);

  const handleAnalyze = useCallback(async (providedAudio?: Float32Array) => {
    const audio = providedAudio ?? pendingAudioRef.current;
    if (!audio) return;

    const events = await detect(audio);
    const mapped = mapNoteEvents(events);
    setNotes(mapped);
    midiPlayback.load(mapped);

    const pitchClasses = getUniquePitchClasses(mapped);
    const detected = detectChord(pitchClasses);
    const chordName = detected ? formatChordName(detected) : null;
    setChord(chordName);
    setHasPendingAnalysis(false);

    if (mapped.length > 0) {
      const audioFileName = `riff-${crypto.randomUUID()}.f32`;
      const didPersistAudio = await savePcmToOpfs(audioFileName, audio);

      const newRiff: StoredRiff = {
        id: crypto.randomUUID(),
        name: `Riff ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        timestamp: Date.now(),
        durationS: audio.length / 22050,
        notes: mapped,
        chord: chordName,
        audioFileName: didPersistAudio ? audioFileName : null,
      };

      try {
        await saveRiff(newRiff);
        setSavedRiffs((prev) => [newRiff, ...prev]);
      } catch {
        // Ignore save errors
      }
    }
  }, [detect, midiPlayback]);

  const handleStop = useCallback(async () => {
    const audio = await stopRecording();
    if (!audio) return;

    audioPlayback.load(audio);
    setHasRecording(true);
    pendingAudioRef.current = audio;
    setNotes([]);
    setChord(null);
    midiPlayback.stop();

    if (autoProcess) {
      setHasPendingAnalysis(false);
      await handleAnalyze(audio);
    } else {
      setHasPendingAnalysis(true);
    }
  }, [stopRecording, audioPlayback, midiPlayback, autoProcess, handleAnalyze]);

  const handleLoadSavedRiff = useCallback(async (riff: StoredRiff) => {
    midiPlayback.stop();
    pendingAudioRef.current = null;
    setHasPendingAnalysis(false);

    if (riff.audioFileName) {
      const restoredAudio = await readPcmFromOpfs(riff.audioFileName);
      if (restoredAudio) {
        audioPlayback.load(restoredAudio);
        setHasRecording(true);
      } else {
        setHasRecording(false);
      }
    } else {
      setHasRecording(false);
    }

    setNotes(riff.notes);
    setChord(riff.chord);
    midiPlayback.load(riff.notes);
  }, [audioPlayback, midiPlayback]);

  const handleLoadDemoAnalysis = useCallback(() => {
    midiPlayback.stop();
    pendingAudioRef.current = null;
    setHasRecording(false);
    setHasPendingAnalysis(false);

    setNotes(DEMO_NOTES);
    midiPlayback.load(DEMO_NOTES);

    const pitchClasses = getUniquePitchClasses(DEMO_NOTES);
    const detected = detectChord(pitchClasses);
    setChord(detected ? formatChordName(detected) : null);
  }, [midiPlayback]);

  const uniqueNotes = getUniqueNotes(notes);
  const error = recorderError || detectionError;

  return {
    // Recorder state
    recorderState: state,
    handleStart,
    handleStop,
    // ML state
    isLoading,
    progress,
    handleAnalyze,
    // Content
    notes,
    uniqueNotes,
    chord,
    error,
    // Toggle state
    autoProcess,
    setAutoProcess,
    hasRecording,
    hasPendingAnalysis,
    handleLoadDemoAnalysis,
    // Riffs DB
    savedRiffs,
    handleLoadSavedRiff,
    // Playback refs
    audioPlayback,
    midiPlayback,
  };
}
