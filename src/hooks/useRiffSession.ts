import { useEffect, useRef, useState, useCallback } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { PitchDetectionError, usePitchDetection } from "./usePitchDetection";
import { useAudioPlayback } from "./useAudioPlayback";
import { useMidiPlayback } from "./useMidiPlayback";
import { mapNoteEvents, getUniquePitchClasses, getUniqueNotes, filterNotes, type MappedNote } from "../lib/noteMapper";
import { detectChord, detectChordTimeline, formatChordName, detectChordsWindowed, type ChordEvent } from "../lib/chordDetector";
import { listRiffs, saveRiff, type StoredRiff } from "../lib/db";
import { readPcmFromOpfs, savePcmToOpfs, saveBlobToOpfs, readBlobFromOpfs } from "../lib/audioStorage";
import { decodeAudioFile } from "../lib/audioImport";
import { encodeCompressed, mimeToExtension, type AudioFormat } from "../lib/audioEncoder";
import { PROFILES, type ProfileId } from "../lib/instrumentProfiles";
import { detectKey, type KeyDetection } from "../lib/keyDetector";

const DEMO_NOTES: MappedNote[] = [
  { midi: 60, name: "C4", pitchClass: "C", octave: 4, startTimeS: 0, durationS: 0.45, amplitude: 0.8 },
  { midi: 64, name: "E4", pitchClass: "E", octave: 4, startTimeS: 0.5, durationS: 0.45, amplitude: 0.78 },
  { midi: 67, name: "G4", pitchClass: "G", octave: 4, startTimeS: 1, durationS: 0.45, amplitude: 0.75 },
  { midi: 71, name: "B4", pitchClass: "B", octave: 4, startTimeS: 1.5, durationS: 0.45, amplitude: 0.73 },
  { midi: 72, name: "C5", pitchClass: "C", octave: 5, startTimeS: 2, durationS: 0.5, amplitude: 0.81 },
];

export function useRiffSession() {
  const { state, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const { detect, preload: preloadModel, isLoading, progress, error: detectionError } = usePitchDetection();
  const audioPlayback = useAudioPlayback();
  const midiPlayback = useMidiPlayback();

  const [notes, setNotes] = useState<MappedNote[]>([]);
  const [chord, setChord] = useState<string | null>(null);
  const [chordTimeline, setChordTimeline] = useState<ChordEvent[]>([]);
  const [keyDetection, setKeyDetection] = useState<KeyDetection | null>(null);
  const [hasRecording, setHasRecording] = useState(false);
  const [hasPendingAnalysis, setHasPendingAnalysis] = useState(false);
  const [autoProcess, setAutoProcess] = useState(() => localStorage.getItem("riff:auto-process") === "true");
  const [savedRiffs, setSavedRiffs] = useState<StoredRiff[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [storageFormat, setStorageFormat] = useState<AudioFormat>(() => {
    const stored = localStorage.getItem("riff:storage-format");
    return stored === "compressed" ? "compressed" : "pcm";
  });
  const [activeRiffName, setActiveRiffName] = useState("riff");
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressedMime, setCompressedMime] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<ProfileId>(() => {
    const stored = localStorage.getItem("riff:instrument-profile");
    return stored === "default" || stored === "guitar" || stored === "piano" ? stored : "guitar";
  });

  const pendingAudioRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    preloadModel().catch(() => {
      // Model preload can retry during analysis.
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
        // Ignore riff loading failures.
      });
  }, []);

  const resetAnalysisState = useCallback(() => {
    setNotes([]);
    setChord(null);
    setChordTimeline([]);
    setKeyDetection(null);
    setCompressedBlob(null);
    setCompressedMime(null);
  }, []);

  const handleStart = useCallback(() => {
    resetAnalysisState();
    setHasRecording(false);
    setHasPendingAnalysis(false);
    pendingAudioRef.current = null;
    midiPlayback.stop();
    startRecording();
  }, [midiPlayback, resetAnalysisState, startRecording]);

  const handleAnalyze = useCallback(async (providedAudio?: Float32Array) => {
    const sourceAudio = providedAudio ?? pendingAudioRef.current;
    if (!sourceAudio) return;

    const profile = PROFILES[profileId];
    let analysisAudio = sourceAudio;

    try {
      const detectionResult = await detect(sourceAudio, {
        confidenceThreshold: profile.confidenceThreshold,
        onsetThreshold: profile.onsetThreshold,
        maxPolyphony: profile.maxPolyphony,
      });

      analysisAudio = detectionResult.audio;
      pendingAudioRef.current = analysisAudio;

      const mapped = mapNoteEvents(detectionResult.notes);
      const filtered = filterNotes(mapped, profile);
      setNotes(filtered);
      setKeyDetection(detectKey(filtered));
      midiPlayback.load(filtered);

      const timeline = detectChordTimeline(filtered, profile.chordWindowS > 0 ? profile.chordWindowS : 0);
      setChordTimeline(timeline);

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

      if (filtered.length === 0) {
        return;
      }

      let audioFileName: string | null = null;
      let audioFormat: AudioFormat = "pcm";
      let audioMime: string | undefined;

      if (storageFormat === "compressed") {
        const result = await encodeCompressed(analysisAudio, 22050);
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

      if (!audioFileName) {
        audioFileName = `riff-${crypto.randomUUID()}.f32`;
        const didPersist = await savePcmToOpfs(audioFileName, analysisAudio);
        if (!didPersist) {
          audioFileName = null;
        }
        audioFormat = "pcm";
        audioMime = undefined;
      }

      const riffName = `Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      setActiveRiffName(riffName);

      const newRiff: StoredRiff = {
        id: crypto.randomUUID(),
        name: riffName,
        timestamp: Date.now(),
        durationS: analysisAudio.length / 22050,
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
        // Ignore save failures.
      }
    } catch (error) {
      if (error instanceof PitchDetectionError && error.audio) {
        pendingAudioRef.current = error.audio;
      } else {
        pendingAudioRef.current = analysisAudio;
      }
      setHasPendingAnalysis(true);
    }
  }, [detect, midiPlayback, profileId, storageFormat]);

  const handleStop = useCallback(async () => {
    const audio = await stopRecording();
    if (!audio) return;

    audioPlayback.load(audio);
    setHasRecording(true);
    pendingAudioRef.current = audio;
    resetAnalysisState();
    midiPlayback.stop();

    if (autoProcess) {
      setHasPendingAnalysis(false);
      await handleAnalyze(audio);
      return;
    }

    setHasPendingAnalysis(true);
  }, [audioPlayback, autoProcess, handleAnalyze, midiPlayback, resetAnalysisState, stopRecording]);

  const handleImport = useCallback(async (file: File) => {
    setIsImporting(true);
    setImportError(null);
    resetAnalysisState();
    setHasRecording(false);
    setHasPendingAnalysis(false);
    pendingAudioRef.current = null;
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
    } catch (error) {
      if (error instanceof Error && error.message) {
        setImportError(error.message);
      } else {
        setImportError("Could not decode this audio file. Try WAV, MP3, or FLAC.");
      }
    } finally {
      setIsImporting(false);
    }
  }, [audioPlayback, autoProcess, handleAnalyze, midiPlayback, resetAnalysisState]);

  const handleLoadSavedRiff = useCallback(async (riff: StoredRiff) => {
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
    setChordTimeline(detectChordTimeline(riff.notes, PROFILES[profileId].chordWindowS));
    setKeyDetection(detectKey(riff.notes));
    setActiveRiffName(riff.name);
    midiPlayback.load(riff.notes);
  }, [audioPlayback, midiPlayback, profileId]);

  const handleLoadDemoAnalysis = useCallback(() => {
    midiPlayback.stop();
    pendingAudioRef.current = null;
    setHasRecording(false);
    setHasPendingAnalysis(false);
    setCompressedBlob(null);
    setCompressedMime(null);

    setNotes(DEMO_NOTES);
    midiPlayback.load(DEMO_NOTES);
    setChordTimeline(detectChordTimeline(DEMO_NOTES, PROFILES[profileId].chordWindowS));
    setKeyDetection(detectKey(DEMO_NOTES));

    const pitchClasses = getUniquePitchClasses(DEMO_NOTES);
    const detected = detectChord(pitchClasses);
    setChord(detected ? formatChordName(detected) : null);
  }, [midiPlayback, profileId]);

  const uniqueNotes = getUniqueNotes(notes);
  const error = recorderError || detectionError || importError;

  return {
    recorderState: state,
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
    handleLoadSavedRiff,
    audioPlayback,
    midiPlayback,
    pendingAudio: pendingAudioRef.current,
    activeRiffName,
    compressedBlob,
    compressedMime,
    profileId,
    setProfileId,
  };
}
