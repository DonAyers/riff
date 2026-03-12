import { useEffect, type MouseEvent as ReactMouseEvent } from "react";
import { X } from "lucide-react";
import type { ChordEvent } from "../lib/chordDetector";
import { lookupVoicings } from "../lib/chordVoicings";
import { ChordFretboard } from "./ChordFretboard";
import "./SelectedChordDialog.css";

interface SelectedChordDialogProps {
  chord: string;
  context?: ChordEvent;
  voicingIndex: number;
  onVoicingChange: (index: number) => void;
  onClose: () => void;
}

export function SelectedChordDialog({
  chord,
  context,
  voicingIndex,
  onVoicingChange,
  onClose,
}: SelectedChordDialogProps) {
  const voicings = lookupVoicings(chord);
  const activeVoicing = voicings[voicingIndex] ?? null;
  const hasMultipleVoicings = voicings.length > 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key === "ArrowRight" && hasMultipleVoicings) {
        onVoicingChange((voicingIndex + 1) % voicings.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasMultipleVoicings, onClose, onVoicingChange, voicingIndex, voicings.length]);

  const handleBackdropClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleNextVoicing = () => {
    if (!hasMultipleVoicings) {
      return;
    }

    onVoicingChange((voicingIndex + 1) % voicings.length);
  };

  return (
    <div
      className="selected-chord-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Selected guitar chord"
      onClick={handleBackdropClick}
    >
      <div className="selected-chord-sheet">
        <button
          type="button"
          className="selected-chord-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={18} strokeWidth={2} />
        </button>

        <div className="selected-chord-sheet__header">
          {context && (
            <p className="selected-chord-sheet__context">
              Timeline chord · {context.startTimeS.toFixed(2)}s
            </p>
          )}
          <h2>{chord}</h2>
          {activeVoicing ? (
            <p className="selected-chord-sheet__meta">
              Guitar voicing {voicingIndex + 1} of {voicings.length}
            </p>
          ) : (
            <p className="selected-chord-sheet__meta">
              No saved guitar voicings for this chord yet.
            </p>
          )}
        </div>

        <div className="selected-chord-sheet__body">
          {activeVoicing ? (
            <ChordFretboard chordName={chord} voicing={activeVoicing} />
          ) : (
            <div className="selected-chord-sheet__empty">
              Add a seeded guitar shape for this chord to make it available here.
            </div>
          )}
        </div>

        <div className="selected-chord-sheet__actions">
          <button
            type="button"
            className="analyze-btn analyze-btn--secondary"
            onClick={handleNextVoicing}
            disabled={!hasMultipleVoicings}
          >
            Next phrase
          </button>
          <button
            type="button"
            className="analyze-btn analyze-btn--secondary"
            onClick={onClose}
          >
            Close selected chord
          </button>
        </div>
      </div>
    </div>
  );
}
