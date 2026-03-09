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
        {isPlaying ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <polygon points="6,4 20,12 6,20" />
          </svg>
        )}
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
