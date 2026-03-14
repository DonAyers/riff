import { Play, Square } from "lucide-react";
import type { MappedNote } from "../lib/noteMapper";
import "./PianoRoll.css";

interface PianoRollProps {
  notes: MappedNote[];
  isPlaying?: boolean;
  currentTimeS?: number;
  durationS?: number;
  onPlay?: () => void | Promise<void>;
  onStop?: () => void;
}

const PIANO_LOWEST = 21;  // A0
const PIANO_HIGHEST = 108; // C8

export function PianoRoll({
  notes,
  isPlaying = false,
  currentTimeS = 0,
  durationS = 0,
  onPlay,
  onStop,
}: PianoRollProps) {
  if (notes.length === 0) return null;

  // Find the time range
  const maxTime = Math.max(...notes.map((n) => n.startTimeS + n.durationS));
  const timelineDurationS = Math.max(maxTime, durationS);
  const minMidi = Math.max(PIANO_LOWEST, Math.min(...notes.map((n) => n.midi)) - 2);
  const maxMidi = Math.min(PIANO_HIGHEST, Math.max(...notes.map((n) => n.midi)) + 2);
  const midiRange = maxMidi - minMidi + 1;
  const playheadLeft = timelineDurationS > 0
    ? Math.min(100, Math.max(0, (currentTimeS / timelineDurationS) * 100))
    : 0;
  const hasPlaybackControls = typeof onPlay === "function" && typeof onStop === "function";

  const handlePlaybackToggle = () => {
    if (!hasPlaybackControls) {
      return;
    }

    if (isPlaying) {
      onStop();
      return;
    }

    void onPlay();
  };

  return (
    <div className="piano-roll">
      <div className="piano-roll__header">
        <h2>Performance timeline</h2>
        {hasPlaybackControls && (
          <div className="piano-roll__controls">
            <span className="piano-roll__time" aria-live="polite">
              {formatTime(currentTimeS)} / {formatTime(timelineDurationS)}
            </span>
            <button
              type="button"
              className={`piano-roll__playback-btn${isPlaying ? " is-active" : ""}`}
              onClick={handlePlaybackToggle}
              aria-label={isPlaying ? "Stop MIDI preview" : "Play MIDI preview"}
            >
              {isPlaying ? (
                <>
                  <Square size={16} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Play size={16} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                  <span>Play</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
      <div className="piano-roll-container">
        {/* Y-axis: pitch labels */}
        <div className="piano-roll-labels">
          {Array.from({ length: midiRange }, (_, i) => {
            const midi = maxMidi - i;
            const name = midiToName(midi);
            return (
              <div key={midi} className="piano-roll-label">
                {name}
              </div>
            );
          })}
        </div>

        {/* Grid + note blocks */}
        <div className="piano-roll-grid" style={{ "--rows": midiRange } as React.CSSProperties}>
          {hasPlaybackControls && (
            <div
              className={`piano-roll-playhead${isPlaying ? " is-active" : ""}`}
              style={{ left: `${playheadLeft}%` }}
              aria-hidden="true"
            />
          )}
          {notes.map((note, i) => {
            const left = timelineDurationS > 0 ? (note.startTimeS / timelineDurationS) * 100 : 0;
            const width = timelineDurationS > 0 ? (note.durationS / timelineDurationS) * 100 : 5;
            const bottom = ((note.midi - minMidi) / midiRange) * 100;
            const height = (1 / midiRange) * 100;

            return (
              <div
                key={`${note.midi}-${i}`}
                className="piano-roll-note"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 1)}%`,
                  bottom: `${bottom}%`,
                  height: `${height}%`,
                }}
                title={`${note.name} (${note.startTimeS.toFixed(2)}s)`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function midiToName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const note = names[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}
