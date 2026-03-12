import "./ChordDisplay.css";

interface ChordDisplayProps {
  chordName: string | null;
  onChordSelect: (chordName: string) => void;
}

export function ChordDisplay({ chordName, onChordSelect }: ChordDisplayProps) {
  if (!chordName) return null;

  return (
    <button
      type="button"
      className="chord-display chord-display--interactive"
      aria-label={`Select chord ${chordName}`}
      onClick={() => onChordSelect(chordName)}
    >
      <span className="chord-label">Chord</span>
      <span className="chord-name">{chordName}</span>
    </button>
  );
}
