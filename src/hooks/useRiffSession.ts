import { useEffect, useRef, useState, useCallback } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { PitchDetectionError, usePitchDetection } from "./usePitchDetection";
import { useAudioPlayback } from "./useAudioPlayback";
import { useMidiPlayback } from "./useMidiPlayback";
import { mapNoteEvents, getUniquePitchClasses, getUniqueNotes, filterNotes, type MappedNote } from "../lib/noteMapper";
import { detectChord, detectChordTimeline, formatChordName, detectChordsWindowed, type ChordEvent } from "../lib/chordDetector";
import { saveSession, listSessions, deleteSession, type RiffSession } from "../lib/db";
import { deleteStoredAudio, readPcmFromOpfs, savePcmToOpfs, saveBlobToOpfs, readBlobFromOpfs } from "../lib/audioStorage";
import { decodeAudioFile } from "../lib/audioImport";
import { encodeCompressed, mimeToExtension, type AudioFormat } from "../lib/audioEncoder";
import { PROFILES, normalizeStoredProfileId, type ProfileId } from "../lib/instrumentProfiles";
import { detectKey, type KeyDetection } from "../lib/keyDetector";
import { ANALYSIS_SAMPLE_RATE, type PreparedAudio } from "../lib/audioData";

/** Derive sorted, unique pitch-class names from a notes array. */
function deriveUniqueNoteNames(notes: readonly MappedNote[]): string[] {
  const seen = new Set<string>();
  for (const n of notes) seen.add(n.pitchClass);
  return [...seen].sort();
}

const DEMO_NOTES: MappedNote[] = [
  { midi: 60, name: "C4", pitchClass: "C", octave: 4, startTimeS: 0, durationS: 0.45, amplitude: 0.8 },
  { midi: 64, name: "E4", pitchClass: "E", octave: 4, startTimeS: 0.5, durationS: 0.45, amplitude: 0.78 },
  { midi: 67, name: "G4", pitchClass: "G", octave: 4, startTimeS: 1, durationS: 0.45, amplitude: 0.75 },
  { midi: 71, name: "B4", pitchClass: "B", octave: 4, startTimeS: 1.5, durationS: 0.45, amplitude: 0.73 },
  { midi: 72, name: "C5", pitchClass: "C", octave: 5, startTimeS: 2, durationS: 0.5, amplitude: 0.81 },
];

const PROFILE_STORAGE_KEY = "riff:instrument-profile";
const MODEL_PRELOAD_FALLBACK_DELAY_MS = 250;

export function useRiffSession() {
  const { state, startRecording, stopRecording, error: recorderError } = useAudioRecorder();
  const { detect, preload: preloadModel, isLoading, progress, error: detectionError } = usePitchDetection();
  const audioPlayback = useAudioPlayback();
  const hasPersistedInitialProfileRef = useRef(false);
  const needsStoredProfileCleanupRef = useRef(false);
  const [profileId, setProfileId] = useState<ProfileId>(() => {
    const normalizedStoredProfile = normalizeStoredProfileId(localStorage.getItem(PROFILE_STORAGE_KEY));
    needsStoredProfileCleanupRef.current = normalizedStoredProfile.didMigrate;
    return normalizedStoredProfile.profileId;
  });
  const midiPlayback = useMidiPlayback(profileId);

  const [notes, setNotes] = useState<MappedNote[]>([]);
  const [chord, setChord] = useState<string | null>(null);
  const [chordTimeline, setChordTimeline] = useState<ChordEvent[]>([]);
  const [keyDetection, setKeyDetection] = useState<KeyDetection | null>(null);
  const [hasRecording, setHasRecording] = useState(false);
  const [hasPendingAnalysis, setHasPendingAnalysis] = useState(false);
  const [autoProcess, setAutoProcess] = useState(() => localStorage.getItem("riff:auto-process") === "true");
  const [savedRiffs, setSavedRiffs] = useState<RiffSession[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [storageFormat, setStorageFormat] = useState<AudioFormat>(() => {
    const stored = localStorage.getItem("riff:storage-format");
    return stored === "compressed" ? "compressed" : "pcm";
  });
  const [activeRiffName, setActiveRiffName] = useState("riff");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressedMime, setCompressedMime] = useState<string | null>(null);

  const pendingAnalysisAudioRef = useRef<Float32Array | null>(null);
  const pendingSourceAudioRef = useRef<{ pcm: Float32Array; sampleRate: number } | null>(null);
  /** Tracks import context so handleAnalyze can set source/importFileName. */
  const importContextRef = useRef<{ fileName: string } | null>(null);

  useEffect(() => {
    const scheduler = globalThis as typeof globalThis & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const preloadOnIdle = () => {
      preloadModel().catch(() => {
        // Model preload can retry during analysis.
      });
    };

    if (typeof scheduler.requestIdleCallback === "function") {
      const idleCallbackId = scheduler.requestIdleCallback(() => {
        preloadOnIdle();
      });

      return () => {
        scheduler.cancelIdleCallback?.(idleCallbackId);
      };
    }

    const timeoutId = globalThis.setTimeout(preloadOnIdle, MODEL_PRELOAD_FALLBACK_DELAY_MS);
    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [preloadModel]);

  useEffect(() => {
    localStorage.setItem("riff:auto-process", autoProcess ? "true" : "false");
  }, [autoProcess]);

  useEffect(() => {
    localStorage.setItem("riff:storage-format", storageFormat);
  }, [storageFormat]);

  useEffect(() => {
    if (!hasPersistedInitialProfileRef.current) {
      hasPersistedInitialProfileRef.current = true;

      if (!needsStoredProfileCleanupRef.current) {
        return;
      }

      needsStoredProfileCleanupRef.current = false;
    }

    localStorage.setItem(PROFILE_STORAGE_KEY, profileId);
  }, [profileId]);

  useEffect(() => {
    listSessions()
      .then((sessions) => setSavedRiffs(sessions))
      .catch(() => {
        // Ignore session loading failures.
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

  const resetPlaybackState = useCallback(() => {
    audioPlayback.reset();
    midiPlayback.stop();
  }, [audioPlayback, midiPlayback]);

  const handleStart = useCallback(() => {
    resetAnalysisState();
    setHasRecording(false);
    setHasPendingAnalysis(false);
    pendingAnalysisAudioRef.current = null;
    pendingSourceAudioRef.current = null;
    resetPlaybackState();
    startRecording();
  }, [resetAnalysisState, resetPlaybackState, startRecording]);

  const handleAnalyze = useCallback(async (providedAudio?: PreparedAudio) => {
    const sourceAudio = providedAudio?.analysisAudio ?? pendingAnalysisAudioRef.current;
    const storedAudio = providedAudio
      ? { pcm: providedAudio.storedAudio, sampleRate: providedAudio.storedSampleRate }
      : pendingSourceAudioRef.current;
    if (!sourceAudio || !storedAudio) return;

    if (providedAudio) {
      pendingAnalysisAudioRef.current = providedAudio.analysisAudio;
      pendingSourceAudioRef.current = storedAudio;
    }

    const profile = PROFILES[profileId];
    let analysisAudio = sourceAudio;

    try {
      const detectionResult = await detect(sourceAudio, {
        confidenceThreshold: profile.confidenceThreshold,
        onsetThreshold: profile.onsetThreshold,
        maxPolyphony: profile.maxPolyphony,
      });

      analysisAudio = detectionResult.audio;
      pendingAnalysisAudioRef.current = analysisAudio;

      const mapped = mapNoteEvents(detectionResult.notes);
      const filtered = filterNotes(mapped, profile);
      setNotes(filtered);
      const keyResult = detectKey(filtered);
      setKeyDetection(keyResult);
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
        const result = await encodeCompressed(storedAudio.pcm, storedAudio.sampleRate);
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
        const didPersist = await savePcmToOpfs(audioFileName, storedAudio.pcm);
        if (!didPersist) {
          audioFileName = null;
        }
        audioFormat = "pcm";
        audioMime = undefined;
      }

      const riffName = `Take ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      setActiveRiffName(riffName);

      const importContext = importContextRef.current;
      const now = Date.now();
      const newSession: RiffSession = {
        id: crypto.randomUUID(),
        name: riffName,
        createdAt: now,
        updatedAt: now,
        source: importContext ? "import" : "recording",
        ...(importContext && { importFileName: importContext.fileName }),
        durationS: storedAudio.pcm.length / storedAudio.sampleRate,
        audioSampleRate: storedAudio.sampleRate,
        audioFileName,
        audioFormat,
        audioMime,
        profileId,
        notes: filtered,
        chordTimeline: timeline,
        keyDetection: keyResult,
        primaryChord: chordName,
        uniqueNoteNames: deriveUniqueNoteNames(filtered),
      };

      try {
        await saveSession(newSession);
        setSavedRiffs((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
      } catch {
        // Ignore save failures.
      }
    } catch (error) {
      if (error instanceof PitchDetectionError && error.audio) {
        pendingAnalysisAudioRef.current = error.audio;
      } else {
        pendingAnalysisAudioRef.current = analysisAudio;
      }
      setHasPendingAnalysis(true);
    }
  }, [detect, midiPlayback, profileId, storageFormat]);

  const handleStop = useCallback(async () => {
    const audio = await stopRecording();
    if (!audio) return;

    audioPlayback.load(audio.storedAudio, audio.storedSampleRate);
    setHasRecording(true);
    pendingAnalysisAudioRef.current = audio.analysisAudio;
    pendingSourceAudioRef.current = {
      pcm: audio.storedAudio,
      sampleRate: audio.storedSampleRate,
    };
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
    pendingAnalysisAudioRef.current = null;
    pendingSourceAudioRef.current = null;
    importContextRef.current = { fileName: file.name };
    resetPlaybackState();

    try {
      const audio = await decodeAudioFile(file);
      audioPlayback.load(audio.storedAudio, audio.storedSampleRate);
      setHasRecording(true);
      pendingAnalysisAudioRef.current = audio.analysisAudio;
      pendingSourceAudioRef.current = {
        pcm: audio.storedAudio,
        sampleRate: audio.storedSampleRate,
      };

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
      importContextRef.current = null;
      setIsImporting(false);
    }
  }, [audioPlayback, autoProcess, handleAnalyze, resetAnalysisState, resetPlaybackState]);

  const handleLoadSavedRiff = useCallback(async (session: RiffSession) => {
    pendingAnalysisAudioRef.current = null;
    pendingSourceAudioRef.current = null;
    setHasPendingAnalysis(false);
    setCompressedBlob(null);
    setCompressedMime(null);
    resetPlaybackState();

    if (session.audioFileName) {
      const format = session.audioFormat ?? "pcm";

      if (format === "compressed" && session.audioMime) {
        const blob = await readBlobFromOpfs(session.audioFileName, session.audioMime);
        if (blob) {
          audioPlayback.loadBlob(blob);
          setHasRecording(true);
          setCompressedBlob(blob);
          setCompressedMime(session.audioMime);
        } else {
          setHasRecording(false);
        }
      } else {
        const restoredAudio = await readPcmFromOpfs(session.audioFileName);
        if (restoredAudio) {
          const sampleRate = session.audioSampleRate ?? ANALYSIS_SAMPLE_RATE;
          pendingSourceAudioRef.current = {
            pcm: restoredAudio,
            sampleRate,
          };
          pendingAnalysisAudioRef.current = sampleRate === ANALYSIS_SAMPLE_RATE
            ? restoredAudio.slice()
            : null;
          audioPlayback.load(restoredAudio, sampleRate);
          setHasRecording(true);
        } else {
          setHasRecording(false);
        }
      }
    } else {
      setHasRecording(false);
    }

    const notes = [...session.notes];
    setNotes(notes);
    setChord(session.primaryChord);

    // Use persisted timeline if available, otherwise re-derive (v1 records have empty timeline).
    if (session.chordTimeline.length > 0) {
      setChordTimeline([...session.chordTimeline]);
    } else {
      setChordTimeline(detectChordTimeline(notes, PROFILES[profileId].chordWindowS));
    }

    // Use persisted key detection if available, otherwise re-derive.
    setKeyDetection(session.keyDetection ?? detectKey(notes));

    setActiveRiffName(session.name);
    setActiveSessionId(session.id);
    midiPlayback.load(notes);

    // Restore the session's profile when it differs from the current one.
    if (session.profileId !== profileId) {
      setProfileId(session.profileId);
    }
  }, [audioPlayback, midiPlayback, profileId, resetPlaybackState, setProfileId]);

  const handleLoadDemoAnalysis = useCallback(() => {
    resetPlaybackState();
    pendingAnalysisAudioRef.current = null;
    pendingSourceAudioRef.current = null;
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
  }, [midiPlayback, profileId, resetPlaybackState]);

  const handleDeleteSession = useCallback(async (id: string) => {
    const session = savedRiffs.find((item) => item.id === id);
    await deleteSession(id);
    if (session?.audioFileName) {
      await deleteStoredAudio(session.audioFileName);
    }
    setSavedRiffs((prev) => prev.filter((s) => s.id !== id));
    setActiveSessionId((prev) => (prev === id ? null : prev));
  }, [savedRiffs]);

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
    activeSessionId,
    handleLoadSavedRiff,
    handleDeleteSession,
    audioPlayback,
    midiPlayback,
    pendingAudio: pendingSourceAudioRef.current?.pcm ?? null,
    pendingAudioSampleRate: pendingSourceAudioRef.current?.sampleRate ?? null,
    activeRiffName,
    compressedBlob,
    compressedMime,
    profileId,
    setProfileId,
  };
}
