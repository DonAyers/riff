import type { KeyDetection } from "../lib/keyDetector";
import "./KeyDisplay.css";

const TONICS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface KeyDisplayProps {
  result: KeyDetection | null;
}

function getRelativeLabel(result: NonNullable<KeyDetection["primary"]>) {
  const tonicIndex = TONICS.indexOf(result.key);
  if (tonicIndex === -1) return null;

  if (result.mode === "major") {
    return `${TONICS[(tonicIndex + 9) % TONICS.length]} Minor`;
  }

  return `${TONICS[(tonicIndex + 3) % TONICS.length]} Major`;
}

export function KeyDisplay({ result }: KeyDisplayProps) {
  if (!result?.primary) return null;

  const relativeLabel = getRelativeLabel(result.primary);
  const confidence = Math.round(result.primary.confidence * 100);

  return (
    <div className="key-display">
      <span className="key-display__label">Detected key</span>
      <span className="key-display__value">{result.primary.label}</span>
      {relativeLabel && <span className="key-display__meta">Relative: {relativeLabel}</span>}
      <span className="key-display__confidence">Confidence {confidence}%</span>
      {result.lowConfidence && (
        <p className="key-display__warning">Record a longer clip for a more reliable key estimate.</p>
      )}
    </div>
  );
}