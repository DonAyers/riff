import type { MappedNote } from "../lib/noteMapper";
import "./PianoRoll.css";

interface PianoRollProps {
  notes: MappedNote[];
}

const PIANO_LOWEST = 21;  // A0
const PIANO_HIGHEST = 108; // C8

export function PianoRoll({ notes }: PianoRollProps) {
  if (notes.length === 0) return null;

  // Find the time range
  const maxTime = Math.max(...notes.map((n) => n.startTimeS + n.durationS));
  const minMidi = Math.max(PIANO_LOWEST, Math.min(...notes.map((n) => n.midi)) - 2);
  const maxMidi = Math.min(PIANO_HIGHEST, Math.max(...notes.map((n) => n.midi)) + 2);
  const midiRange = maxMidi - minMidi + 1;

  return (
    <div className="piano-roll">
      <h2>Performance timeline</h2>
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
          {notes.map((note, i) => {
            const left = maxTime > 0 ? (note.startTimeS / maxTime) * 100 : 0;
            const width = maxTime > 0 ? (note.durationS / maxTime) * 100 : 5;
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

function midiToName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const note = names[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}
