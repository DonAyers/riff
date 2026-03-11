import type { ChordEvent } from "../lib/chordDetector";
import "./ChordTimeline.css";

interface ChordTimelineProps {
  events: ChordEvent[];
}

export function ChordTimeline({ events }: ChordTimelineProps) {
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
            <div
              key={`${event.chord}-${event.startTimeS}-${index}`}
              className="chord-timeline__event"
              style={{
                left: `${left}%`,
                width: `${Math.max(width, 10)}%`,
              }}
              title={`${event.label} (${event.startTimeS.toFixed(2)}s)`}
            >
              {event.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}