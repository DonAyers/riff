import type { StoredRiff } from "../lib/db";
import "./SavedRiffs.css";

interface SavedRiffsProps {
  riffs: StoredRiff[];
  onLoad: (riff: StoredRiff) => void | Promise<void>;
}

export function SavedRiffs({ riffs, onLoad }: SavedRiffsProps) {
  if (riffs.length === 0) {
    return null;
  }

  return (
    <section className="saved-riffs">
      <h2>Saved Riffs</h2>
      <ul className="saved-riffs-list">
        {riffs.map((riff) => (
          <li key={riff.id} className="saved-riff-item">
            <div className="saved-riff-meta">
              <strong>{riff.name}</strong>
              <span>{formatDate(riff.timestamp)}</span>
              <span>{riff.notes.length} notes</span>
              <span>{formatDuration(riff.durationS)}</span>
            </div>
            <button className="saved-riff-load" onClick={() => onLoad(riff)}>
              Load
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
