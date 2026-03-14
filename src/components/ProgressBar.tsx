import "./ProgressBar.css";

interface ProgressBarProps {
  progress: number;
  visible: boolean;
  eyebrow?: string;
  label?: string;
  description?: string;
  variant?: "inline" | "panel";
  ariaLabel?: string;
}

const PROGRESS_STAGES = [
  {
    min: 0,
    label: "Preparing analysis",
    description: "Getting everything ready before the review panel fills in.",
  },
  {
    min: 25,
    label: "Listening for notes",
    description: "Checking pitch and timing so the review stays easy to scan.",
  },
  {
    min: 60,
    label: "Shaping the results",
    description: "Pulling the note, chord, and playback views together now.",
  },
  {
    min: 90,
    label: "Finishing up",
    description: "The review panel should be ready in a moment.",
  },
] as const;

function clampProgress(progress: number): number {
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function getProgressStage(progress: number) {
  return (
    [...PROGRESS_STAGES]
      .reverse()
      .find((stage) => progress >= stage.min) ?? PROGRESS_STAGES[0]
  );
}

export function ProgressBar({
  progress,
  visible,
  eyebrow,
  label,
  description,
  variant = "inline",
  ariaLabel = "Analysis progress",
}: ProgressBarProps) {
  if (!visible) return null;

  const clampedProgress = clampProgress(progress);
  const stage = getProgressStage(clampedProgress);
  const title = label ?? stage.label;
  const body = description ?? stage.description;
  const liveMessage = `${title}. ${clampedProgress}% complete. ${body}`;

  return (
    <div
      className={`progress-bar-container progress-bar-container--${variant}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="progress-bar-sr-only">{liveMessage}</span>
      <div className="progress-bar-copy">
        {eyebrow && <span className="progress-bar-eyebrow">{eyebrow}</span>}
        <div className="progress-bar-heading">
          <strong className="progress-bar-title">{title}</strong>
          <span className="progress-text">{clampedProgress}%</span>
        </div>
        <p className="progress-bar-description">{body}</p>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clampedProgress}
      >
        <div className="progress-fill" style={{ width: `${clampedProgress}%` }} />
      </div>
    </div>
  );
}
