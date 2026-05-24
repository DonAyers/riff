import { useEffect, useMemo, useState } from "react";
import type { ChordEvent } from "../lib/chordDetector";
import type { ChordSuggestion } from "../lib/chordSuggestions";
import { lookupVoicings } from "../lib/chordVoicings";
import { ChordFocusView } from "./ChordFocusView";
import { ChordFretboard } from "./ChordFretboard";
import "./ChordMapExplorer.css";

interface ChordMapExplorerProps {
  events: ChordEvent[];
  fallbackChord: string | null;
  onOpenChord?: (chordName: string, context?: ChordEvent) => void;
}

interface ChordMapChange {
  id: string;
  chord: string;
  label: string;
  startTimeS: number;
  endTimeS: number;
  events: ChordEvent[];
}

function formatTime(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

function formatRange(change: ChordMapChange): string {
  if (change.endTimeS <= change.startTimeS) {
    return formatTime(change.startTimeS);
  }

  return `${formatTime(change.startTimeS)} - ${formatTime(change.endTimeS)}`;
}

function buildChordChanges(events: readonly ChordEvent[], fallbackChord: string | null): ChordMapChange[] {
  if (events.length === 0) {
    return fallbackChord
      ? [{
          id: `fallback-${fallbackChord}`,
          chord: fallbackChord,
          label: fallbackChord,
          startTimeS: 0,
          endTimeS: 0,
          events: [],
        }]
      : [];
  }

  return events.reduce<ChordMapChange[]>((changes, event, index) => {
    const previous = changes[changes.length - 1];
    if (previous?.chord === event.chord) {
      previous.endTimeS = Math.max(previous.endTimeS, event.endTimeS);
      previous.events.push(event);
      return changes;
    }

    changes.push({
      id: `${event.chord}-${event.startTimeS}-${index}`,
      chord: event.chord,
      label: event.label,
      startTimeS: event.startTimeS,
      endTimeS: event.endTimeS,
      events: [event],
    });
    return changes;
  }, []);
}

export function ChordMapExplorer({ events, fallbackChord, onOpenChord }: ChordMapExplorerProps) {
  const changes = useMemo(() => buildChordChanges(events, fallbackChord), [events, fallbackChord]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedSuggestionChord, setSelectedSuggestionChord] = useState<string | null>(null);
  const [voicingIndex, setVoicingIndex] = useState(0);
  const selectedChange = changes[Math.min(selectedIndex, Math.max(changes.length - 1, 0))] ?? null;
  const activeChord = selectedSuggestionChord ?? selectedChange?.chord ?? fallbackChord;
  const openChordName = selectedSuggestionChord ?? selectedChange?.label ?? activeChord;
  const voicings = lookupVoicings(activeChord);
  const activeVoicing = voicings[voicingIndex] ?? null;

  useEffect(() => {
    if (selectedIndex >= changes.length) {
      setSelectedIndex(Math.max(changes.length - 1, 0));
    }
  }, [changes.length, selectedIndex]);

  useEffect(() => {
    setSelectedSuggestionChord(null);
    setVoicingIndex(0);
  }, [selectedChange?.id]);

  useEffect(() => {
    setVoicingIndex(0);
  }, [activeChord]);

  const handleSuggestion = (suggestion: ChordSuggestion) => {
    setSelectedSuggestionChord(suggestion.chord);
  };

  const handleNextVoicing = () => {
    if (voicings.length <= 1) return;
    setVoicingIndex((current) => (current + 1) % voicings.length);
  };

  if (!selectedChange || !activeChord) {
    return (
      <section className="chord-map-explorer chord-map-explorer--empty" data-testid="chord-map-explorer">
        <div className="chord-map-explorer__empty" role="status">
          <strong>No chord map yet.</strong>
          <span>Record or import a take and Riff will place chord changes here.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="chord-map-explorer" aria-label="Chord map" data-testid="chord-map-explorer">
      <header className="chord-map-explorer__header">
        <div>
          <p className="chord-map-explorer__kicker">Chord map</p>
          <h3>{changes.length} {changes.length === 1 ? "change" : "changes"}</h3>
        </div>
        <p>Tap a card to inspect shapes and try variants.</p>
      </header>

      <div className="chord-map-explorer__strip" aria-label="Detected chord changes">
        {changes.map((change, index) => (
          <button
            key={change.id}
            type="button"
            className={`chord-map-card ${index === selectedIndex ? "is-selected" : ""}`}
            aria-current={index === selectedIndex ? "true" : undefined}
            aria-label={`Explore chord ${change.label} starting ${formatTime(change.startTimeS)}`}
            onClick={() => setSelectedIndex(index)}
            data-testid="chord-map-card"
          >
            <span className="chord-map-card__number">{String(index + 1).padStart(2, "0")}</span>
            <span className="chord-map-card__name">{change.label}</span>
            <span className="chord-map-card__time">{formatRange(change)}</span>
            {change.events.length > 1 && (
              <span className="chord-map-card__count">{change.events.length} hits</span>
            )}
          </button>
        ))}
      </div>

      <div className="chord-map-explorer__detail">
        <section className="chord-map-explorer__shape" aria-label={`Guitar shape for ${activeChord}`}>
          <div className="chord-map-explorer__shape-header">
            <div>
              <p className="chord-map-explorer__kicker">{selectedSuggestionChord ? "Variant shape" : "Detected shape"}</p>
              <h4>{selectedSuggestionChord ?? selectedChange.label}</h4>
              <span>{formatRange(selectedChange)}</span>
            </div>
            <div className="chord-map-explorer__shape-actions">
              {selectedSuggestionChord && (
                <button type="button" className="chord-map-explorer__mini-btn" onClick={() => setSelectedSuggestionChord(null)}>
                  Detected
                </button>
              )}
              <button
                type="button"
                className="chord-map-explorer__mini-btn"
                onClick={handleNextVoicing}
                disabled={voicings.length <= 1}
              >
                Next shape
              </button>
            </div>
          </div>

          {activeVoicing ? (
            <ChordFretboard chordName={activeChord} voicing={activeVoicing} />
          ) : (
            <div className="chord-map-explorer__no-shape" role="status">
              No saved guitar shape for this chord yet.
            </div>
          )}
        </section>

        <ChordFocusView
          chordName={activeChord}
          meta={{
            eyebrow: "Variant lab",
            subtitle: selectedSuggestionChord ? "Trying a variation" : "Detected chord",
            detail: formatRange(selectedChange),
          }}
          selectedSuggestionChord={selectedSuggestionChord}
          suggestionCategories={["variate", "spice-up", "spice-down"]}
          limitPerCategory={1}
          showNoteEditor={false}
          onApplySuggestion={handleSuggestion}
        />

        {onOpenChord && (
          <button
            type="button"
            className="chord-map-explorer__open"
            onClick={() => onOpenChord(openChordName, selectedChange.events[0])}
          >
            Open full chord sheet
          </button>
        )}
      </div>
    </section>
  );
}
