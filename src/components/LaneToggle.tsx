import "./LaneToggle.css";

export type Lane = "song" | "chord";

interface LaneToggleProps {
  activeLane: Lane;
  onChange: (lane: Lane) => void;
}

export function LaneToggle({ activeLane, onChange }: LaneToggleProps) {
  return (
    <div className="lane-toggle" role="tablist" aria-label="Workflow">
      <button
        type="button"
        role="tab"
        aria-selected={activeLane === "song"}
        className={`lane-toggle__button ${activeLane === "song" ? "is-active" : ""}`}
        onClick={() => onChange("song")}
      >
        Melody
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeLane === "chord"}
        className={`lane-toggle__button ${activeLane === "chord" ? "is-active" : ""}`}
        onClick={() => onChange("chord")}
      >
        Guitar
      </button>
    </div>
  );
}
