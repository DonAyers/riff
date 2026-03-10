import { Play, Pause } from "lucide-react";
import "./Playback.css";

interface PlaybackProps {
  label: string;
  isPlaying: boolean;
  duration: number;
  onPlay: () => void | Promise<void>;
  onPause: () => void;
  visible: boolean;
}

export function Playback({
  label,
  isPlaying,
  duration,
  onPlay,
  onPause,
  visible,
}: PlaybackProps) {
  if (!visible) return null;

  return (
    <div className="playback">
      <span className="playback-label">{label}</span>
      <button
        className="playback-btn"
        onClick={isPlaying ? onPause : onPlay}
        aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`}
      >
        {isPlaying
          ? <Pause size={18} strokeWidth={2} fill="currentColor" />
          : <Play  size={18} strokeWidth={2} fill="currentColor" />}
      </button>
      <span className="playback-duration">{formatTime(duration)}</span>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
