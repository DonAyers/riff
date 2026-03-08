import type { MappedNote } from "../lib/noteMapper";
import "./NoteDisplay.css";

interface NoteDisplayProps {
  notes: MappedNote[];
}

export function NoteDisplay({ notes }: NoteDisplayProps) {
  if (notes.length === 0) return null;

  return (
    <div className="note-display">
      <h2>Notes Detected</h2>
      <div className="note-chips">
        {notes.map((note, i) => (
          <span key={`${note.midi}-${i}`} className="note-chip">
            {note.name}
          </span>
        ))}
      </div>
    </div>
  );
}
