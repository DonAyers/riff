import "./ChordDisplay.css";

interface ChordDisplayProps {
  chordName: string | null;
}

export function ChordDisplay({ chordName }: ChordDisplayProps) {
  if (!chordName) return null;

  return (
    <div className="chord-display">
      <span className="chord-label">Chord</span>
      <span className="chord-name">{chordName}</span>
    </div>
  );
}
