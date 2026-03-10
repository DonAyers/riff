import { useEffect, useRef, useState } from "react";
import { Mic2, Square, Upload, Sparkles } from "lucide-react";
import { PROFILES, PROFILE_IDS, type ProfileId } from "../lib/instrumentProfiles";
import type { RecorderState } from "../hooks/useAudioRecorder";
import "./Recorder.css";

interface RecorderProps {
  state: RecorderState;
  onStart: () => void;
  onStop: () => void;
  onImport: (file: File) => void;
  isImporting: boolean;
  error: string | null;
  autoProcess: boolean;
  onAutoProcessChange: (v: boolean) => void;
  storageFormat: "pcm" | "compressed";
  onStorageFormatChange: (v: "pcm" | "compressed") => void;
  recorderState: RecorderState;
  isLoading: boolean;
  hasPendingAnalysis: boolean;
  onAnalyze: () => void;
  profileId: ProfileId;
  onProfileChange: (id: ProfileId) => void;
}

export function Recorder({
  state,
  onStart,
  onStop,
  onImport,
  isImporting,
  error,
  autoProcess,
  onAutoProcessChange,
  storageFormat,
  onStorageFormatChange,
  recorderState,
  isLoading,
  hasPendingAnalysis,
  onAnalyze,
  profileId,
  onProfileChange,
}: RecorderProps) {
  const isRecording = state === "recording";
  const isBusy = state === "processing" || isImporting;
  const settingsDisabled = recorderState !== "idle" || isLoading;
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRecording) {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (state === "idle") setSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, state]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  return (
    <div className="recorder">
      <div className="recorder-timer">{formatTime(seconds)}</div>

      <div className="recorder-main-row">
        <button
          className={`record-btn ${isRecording ? "recording" : ""}`}
          onClick={isRecording ? onStop : onStart}
          disabled={isBusy}
          aria-label={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording
            ? <Square size={26} strokeWidth={0} fill="currentColor" />
            : <Mic2 size={26} strokeWidth={1.8} />}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="import-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImport(file);
            e.target.value = "";
          }}
        />
        <button
          className="import-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={isRecording || isBusy}
          aria-label="Import audio file"
          title="Import audio file"
        >
          <Upload size={16} strokeWidth={2} />
        </button>
      </div>

      <p className="recorder-label">
        {state === "idle" && !isImporting && "Tap to record"}
        {state === "recording" && "Recording…"}
        {(state === "processing" || isImporting) && "Preparing…"}
      </p>

      {error && <p className="recorder-error">{error}</p>}

      <div className="recorder-settings">
        <label className="setting-toggle" title="Auto-detect notes when recording stops">
          <input
            type="checkbox"
            checked={autoProcess}
            onChange={(e) => onAutoProcessChange(e.target.checked)}
            disabled={settingsDisabled}
          />
          <span>Auto-detect</span>
        </label>

        <label className="setting-toggle" title="Compress audio when saving">
          <input
            type="checkbox"
            checked={storageFormat === "compressed"}
            onChange={(e) => onStorageFormatChange(e.target.checked ? "compressed" : "pcm")}
            disabled={settingsDisabled}
          />
          <span>Compress</span>
        </label>
      </div>

      <div className="profile-picker" role="radiogroup" aria-label="Instrument profile">
        {PROFILE_IDS.map((id) => (
          <button
            key={id}
            className={`profile-pill ${id === profileId ? "active" : ""}`}
            onClick={() => onProfileChange(id)}
            disabled={settingsDisabled}
            role="radio"
            aria-checked={id === profileId}
          >
            {PROFILES[id].label}
          </button>
        ))}
      </div>

      <div className="recorder-action-row">
        <button
          className="analyze-btn"
          onClick={onAnalyze}
          disabled={autoProcess || !hasPendingAnalysis || isLoading || recorderState !== "idle"}
        >
          <Sparkles size={14} strokeWidth={2} />
          Detect notes
        </button>
      </div>
    </div>
  );
}
