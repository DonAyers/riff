import type { ChordEvent } from "../lib/chordDetector";
import "./ChordTimeline.css";

interface ChordTimelineProps {
  events: ChordEvent[];
  onChordSelect: (chordName: string, context: ChordEvent) => void;
}

function positionTimelineEvent(element: HTMLButtonElement | null, left: number, width: number) {
  if (!element) {
    return;
  }

  element.style.left = `${left}%`;
  element.style.width = `${Math.max(width, 10)}%`;
}

export function ChordTimeline({ events, onChordSelect }: ChordTimelineProps) {
  if (events.length === 0) return null;

  const maxTime = Math.max(...events.map((event) => event.endTimeS));

  return (
    <div className="chord-timeline">
      <h2>Chord timeline</h2>
      <div className="chord-timeline__track">
        {events.map((event, index) => {
          const left = maxTime > 0 ? (event.startTimeS / maxTime) * 100 : 0;
          const width = maxTime > 0 ? ((event.endTimeS - event.startTimeS) / maxTime) * 100 : 100;

          return (
            <button
              type="button"
              key={`${event.chord}-${event.startTimeS}-${index}`}
              className="chord-timeline__event chord-timeline__event--interactive"
              aria-label={`Select chord ${event.label} at ${event.startTimeS.toFixed(2)}s`}
              onClick={() => onChordSelect(event.label, event)}
              ref={(element) => {
                positionTimelineEvent(element, left, width);
              }}
              title={`${event.label} (${event.startTimeS.toFixed(2)}s)`}
            >
              {event.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
