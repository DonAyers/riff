import { useCallback, useRef, useState } from "react";
import type { BeatPosition, LoopGrid, MetronomeSettings } from "../hooks/useLooper";
import { useBeatLight } from "../hooks/useBeatLight";
import { BEATS_PER_BAR_OPTIONS, formatBpm, MAX_BPM, MIN_BPM } from "../lib/metronome";

interface LooperTempoProps {
  metronome: MetronomeSettings;
  grid: LoopGrid | null;
  hasLoop: boolean;
  /** A take or the count-in is running, so tempo and meter cannot change. */
  isBusy: boolean;
  /** The beat light runs while this is true. */
  isTicking: boolean;
  setClickOn: (clickOn: boolean) => void;
  setBpm: (bpm: number) => void;
  setBeatsPerBar: (beatsPerBar: number) => void;
  tapTempo: () => void;
  fitTempoToLoop: () => void;
  scaleTempo: (factor: 2 | 0.5) => void;
  getBeatPosition: () => BeatPosition | null;
  onClose: () => void;
}

function describeLength(beats: number, beatsPerBar: number): string {
  if (beats % beatsPerBar === 0) {
    const bars = beats / beatsPerBar;
    return `${bars} ${bars === 1 ? "bar" : "bars"}`;
  }
  return `${beats} beats`;
}

/** Edits as text and only applies on blur or Enter, so typing "120" never passes through 40. */
function BpmInput({ bpm, disabled, onCommit }: { bpm: number; disabled: boolean; onCommit: (bpm: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft !== null && draft.trim() !== "" && Number.isFinite(Number(draft))) onCommit(Number(draft));
    setDraft(null);
  };

  return (
    <input
      type="number"
      inputMode="decimal"
      min={MIN_BPM}
      max={MAX_BPM}
      step={1}
      value={draft ?? formatBpm(bpm)}
      disabled={disabled}
      aria-label="Tempo in beats per minute"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

export function LooperTempo({
  metronome,
  grid,
  hasLoop,
  isBusy,
  isTicking,
  setClickOn,
  setBpm,
  setBeatsPerBar,
  tapTempo,
  fitTempoToLoop,
  scaleTempo,
  getBeatPosition,
  onClose,
}: LooperTempoProps) {
  const beatsRef = useRef<HTMLDivElement>(null);
  const isLocked = hasLoop || isBusy;

  const showBeat = useCallback((beat: number) => {
    const lights = beatsRef.current;
    if (!lights) return;
    Array.from(lights.children).forEach((light, index) => light.classList.toggle("is-on", index === beat));
  }, []);
  useBeatLight(getBeatPosition, isTicking, showBeat);

  return (
    <fieldset className="looper-tempo" id="looper-metronome-settings">
      <legend>Metronome</legend>
      <div className="looper-tempo__row">
        <button
          type="button"
          className="looper-tempo__click"
          aria-pressed={metronome.clickOn}
          onClick={() => setClickOn(!metronome.clickOn)}
        >
          Click
        </button>
        <div className="looper-tempo__lights" ref={beatsRef} aria-hidden="true">
          {Array.from({ length: metronome.beatsPerBar }, (_, index) => (
            <span key={index} className={index === 0 ? "looper-tempo__light--accent" : undefined} />
          ))}
        </div>
      </div>

      {grid ? (
        <div className="looper-tempo__row">
          <span className="looper-tempo__value" data-testid="loop-tempo">
            {formatBpm(grid.bpm)} BPM · {describeLength(grid.beats, metronome.beatsPerBar)}
          </span>
          <div className="looper-tempo__actions">
            <button
              type="button"
              className="looper__clear-all"
              onClick={() => scaleTempo(0.5)}
              disabled={grid.beats % 2 !== 0 || grid.bpm / 2 < MIN_BPM}
              aria-label="Halve the tempo"
            >
              ÷2
            </button>
            <button
              type="button"
              className="looper__clear-all"
              onClick={() => scaleTempo(2)}
              disabled={grid.bpm * 2 > MAX_BPM}
              aria-label="Double the tempo"
            >
              ×2
            </button>
          </div>
        </div>
      ) : hasLoop ? (
        <div className="looper-tempo__row">
          <span className="looper-tempo__value">Played freely</span>
          <button type="button" className="looper__clear-all" onClick={fitTempoToLoop}>
            Fit tempo
          </button>
        </div>
      ) : (
        <div className="looper-tempo__row">
          <label className="looper-tempo__field">
            BPM
            <BpmInput bpm={metronome.bpm} disabled={isLocked} onCommit={setBpm} />
          </label>
          <button type="button" className="looper__clear-all" onClick={tapTempo} disabled={isLocked}>
            Tap
          </button>
          <label className="looper-tempo__field">
            Beats
            <select
              value={metronome.beatsPerBar}
              disabled={isLocked}
              aria-label="Beats per bar"
              onChange={(event) => setBeatsPerBar(Number(event.target.value))}
            >
              {BEATS_PER_BAR_OPTIONS.map((beats) => (
                <option key={beats} value={beats}>
                  {beats}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="looper-tempo__footer">
        <p>Tap the metronome to turn the click on or off. Hold it to come back here.</p>
        <button type="button" className="looper__clear-all" onClick={onClose}>
          Done
        </button>
      </div>
    </fieldset>
  );
}
