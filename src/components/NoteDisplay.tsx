import type { MappedNote } from "../lib/noteMapper";
import "./NoteDisplay.css";

interface NoteDisplayProps {
  notes: MappedNote[];
  onNoteClick?: (note: MappedNote) => void;
}

export function NoteDisplay({ notes, onNoteClick }: NoteDisplayProps) {
  if (notes.length === 0) return null;

  return (
    <div className="note-display">
      <h2>Notes Detected</h2>
      <div className="note-chips">
        {notes.map((note, i) => (
          <button
            key={`${note.midi}-${i}`}
            type="button"
            className="note-chip"
            onClick={() => onNoteClick?.(note)}
            aria-label={`Play note ${note.name}`}
          >
            {note.name}
          </button>
        ))}
      </div>
    </div>
  );
}
