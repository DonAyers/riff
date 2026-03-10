import { useEffect, useRef, useState, useCallback } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { usePitchDetection } from "./usePitchDetection";
import { useAudioPlayback } from "./useAudioPlayback";
import { useMidiPlayback } from "./useMidiPlayback";
import { mapNoteEvents, getUniquePitchClasses, getUniqueNotes, filterNotes } from "../lib/noteMapper";
import { detectChord, formatChordName, detectChordsWindowed } from "../lib/chordDetector";
import { listRiffs, saveRiff, type StoredRiff } from "../lib/db";
import { readPcmFromOpfs, savePcmToOpfs, saveBlobToOpfs, readBlobFromOpfs } from "../lib/audioStorage";
import { decodeAudioFile } from "../lib/audioImport";
import { encodeCompressed, mimeToExtension, type AudioFormat } from "../lib/audioEncoder";
import { PROFILES, type ProfileId } from "../lib/instrumentProfiles";
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
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [storageFormat, setStorageFormat] = useState<AudioFormat>(() => {
    const stored = localStorage.getItem("riff:storage-format");
    return stored === "compressed" ? "compressed" : "pcm";
  });
  const pendingAudioRef = useRef<Float32Array | null>(null);
  const [activeRiffName, setActiveRiffName] = useState<string>("riff");
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressedMime, setCompressedMime] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<ProfileId>(() => {
    const stored = localStorage.getItem("riff:instrument-profile");
    return (stored === "guitar" || stored === "piano") ? stored : "default";
  });

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
    localStorage.setItem("riff:storage-format", storageFormat);
  }, [storageFormat]);

  useEffect(() => {
    localStorage.setItem("riff:instrument-profile", profileId);
  }, [profileId]);

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
    setCompressedBlob(null);
    setCompressedMime(null);
    midiPlayback.stop();
    startRecording();
  }, [midiPlayback, startRecording]);

  const handleAnalyze = useCallback(async (providedAudio?: Float32Array) => {
    const audio = providedAudio ?? pendingAudioRef.current;
    if (!audio) return;

    const profile = PROFILES[profileId];

    const events = await detect(audio, {
      confidenceThreshold: profile.confidenceThreshold,
      onsetThreshold: profile.onsetThreshold,
      maxPolyphony: profile.maxPolyphony,
    });
    const mapped = mapNoteEvents(events);
    const filtered = filterNotes(mapped, profile);
    setNotes(filtered);
    midiPlayback.load(filtered);

    const chordName = (() => {
      if (profile.chordWindowS > 0) {
        const detected = detectChordsWindowed(filtered, profile.chordWindowS);
        return detected ? formatChordName(detected) : null;
      }
      const pitchClasses = getUniquePitchClasses(filtered);
      const detected = detectChord(pitchClasses);
      return detected ? formatChordName(detected) : null;
    })();
    setChord(chordName);
    setHasPendingAnalysis(false);

    if (filtered.length > 0) {
      let audioFileName: string | null = null;
      let audioFormat: AudioFormat = "pcm";
      let audioMime: string | undefined;

      if (storageFormat === "compressed") {
        const result = await encodeCompressed(audio, 22050);
        if (result) {
          const ext = mimeToExtension(result.mime);
          audioFileName = `riff-${crypto.randomUUID()}.${ext}`;
          const saved = await saveBlobToOpfs(audioFileName, result.blob);
          if (saved) {
            audioFormat = "compressed";
            audioMime = result.mime;
            setCompressedBlob(result.blob);
            setCompressedMime(result.mime);
          } else {
            audioFileName = null;
          }
        }
      }

      // Fall back to PCM if compressed wasn't selected or failed
      if (!audioFileName) {
        audioFileName = `riff-${crypto.randomUUID()}.f32`;
        const didPersist = await savePcmToOpfs(audioFileName, audio);
        if (!didPersist) audioFileName = null;
        audioFormat = "pcm";
        audioMime = undefined;
      }

      const riffName = `Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      setActiveRiffName(riffName);

      const newRiff: StoredRiff = {
        id: crypto.randomUUID(),
        name: riffName,
        timestamp: Date.now(),
        durationS: audio.length / 22050,
        notes: filtered,
        chord: chordName,
        audioFileName,
        audioFormat,
        audioMime,
      };

      try {
        await saveRiff(newRiff);
        setSavedRiffs((prev) => [newRiff, ...prev]);
      } catch {
        // Ignore save errors
      }
    }
  }, [detect, midiPlayback, storageFormat, profileId]);

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

  const handleImport = useCallback(async (file: File) => {
    setIsImporting(true);
    setImportError(null);
    setNotes([]);
    setChord(null);
    setHasRecording(false);
    setHasPendingAnalysis(false);
    pendingAudioRef.current = null;
    setCompressedBlob(null);
    setCompressedMime(null);
    midiPlayback.stop();

    try {
      const audio = await decodeAudioFile(file);

      audioPlayback.load(audio);
      setHasRecording(true);
      pendingAudioRef.current = audio;

      if (autoProcess) {
        setHasPendingAnalysis(false);
        await handleAnalyze(audio);
      } else {
        setHasPendingAnalysis(true);
      }
    } catch {
      setImportError("Could not decode this audio file. Try WAV, MP3, or FLAC.");
    } finally {
      setIsImporting(false);
    }
  }, [audioPlayback, midiPlayback, autoProcess, handleAnalyze]);

  const handleLoadSavedRiff = useCallback(async (riff: StoredRiff) => {
    midiPlayback.stop();
    pendingAudioRef.current = null;
    setHasPendingAnalysis(false);
    setCompressedBlob(null);
    setCompressedMime(null);

    if (riff.audioFileName) {
      const format = riff.audioFormat ?? "pcm";

      if (format === "compressed" && riff.audioMime) {
        const blob = await readBlobFromOpfs(riff.audioFileName, riff.audioMime);
        if (blob) {
          audioPlayback.loadBlob(blob);
          setHasRecording(true);
          setCompressedBlob(blob);
          setCompressedMime(riff.audioMime);
        } else {
          setHasRecording(false);
        }
      } else {
        const restoredAudio = await readPcmFromOpfs(riff.audioFileName);
        if (restoredAudio) {
          pendingAudioRef.current = restoredAudio;
          audioPlayback.load(restoredAudio);
          setHasRecording(true);
        } else {
          setHasRecording(false);
        }
      }
    } else {
      setHasRecording(false);
    }

    setNotes(riff.notes);
    setChord(riff.chord);
    setActiveRiffName(riff.name);
    midiPlayback.load(riff.notes);
  }, [audioPlayback, midiPlayback]);

  const handleLoadDemoAnalysis = useCallback(() => {
    midiPlayback.stop();
    pendingAudioRef.current = null;
    setHasRecording(false);
    setHasPendingAnalysis(false);
    setCompressedBlob(null);
    setCompressedMime(null);

    setNotes(DEMO_NOTES);
    midiPlayback.load(DEMO_NOTES);

    const pitchClasses = getUniquePitchClasses(DEMO_NOTES);
    const detected = detectChord(pitchClasses);
    setChord(detected ? formatChordName(detected) : null);
  }, [midiPlayback]);

  const uniqueNotes = getUniqueNotes(notes);
  const error = recorderError || detectionError || importError;

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
    // Import
    handleImport,
    isImporting,
    // Storage format
    storageFormat,
    setStorageFormat,
    // Riffs DB
    savedRiffs,
    handleLoadSavedRiff,
    // Playback refs
    audioPlayback,
    midiPlayback,
    // Export data
    pendingAudio: pendingAudioRef.current,
    activeRiffName,
    compressedBlob,
    compressedMime,
    // Instrument profile
    profileId,
    setProfileId,
  };
}
