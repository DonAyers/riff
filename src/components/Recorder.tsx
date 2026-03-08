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

  return (
    <div className="recorder">
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
