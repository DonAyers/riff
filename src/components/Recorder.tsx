import { useEffect, useRef, useState } from "react";
import type { RecorderState } from "../hooks/useAudioRecorder";
import "./Recorder.css";

interface RecorderProps {
  state: RecorderState;
  onStart: () => void;
  onStop: () => void;
  error: string | null;
}

export function Recorder({ state, onStart, onStop, error }: RecorderProps) {
  const isRecording = state === "recording";
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

      <button
        className={`record-btn ${isRecording ? "recording" : ""}`}
        onClick={isRecording ? onStop : onStart}
        disabled={state === "processing"}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        <span className="record-icon" />
      </button>

      <p className="recorder-label">
        {state === "idle" && "Tap to record"}
        {state === "recording" && "Listening…"}
        {state === "processing" && "Processing…"}
      </p>

      {error && <p className="recorder-error">{error}</p>}
    </div>
  );
}
