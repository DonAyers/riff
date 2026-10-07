import { useEffect, useRef } from "react";
import { Circle, Minus, Pause, Play, Plus, Square, Trash2, Undo2, Volume2, VolumeX, X } from "lucide-react";
import { useLooper, type LooperTrackState } from "../hooks/useLooper";
import {
  formatLoopTime,
  MAX_LATENCY_NUDGE_MS,
  MIN_LATENCY_NUDGE_MS,
  TAKE_HANDLE_SECONDS,
} from "../lib/looper";
import { LooperTempo } from "./LooperTempo";
import "./Looper.css";

const STATUS_COPY: Record<LooperTrackState["status"], string> = {
  empty: "Empty",
  armed: "Starts at the top of the loop",
  recording: "Recording",
  playing: "Looping",
};

function getRecordLabel(track: LooperTrackState, trackNumber: number, hasLoop: boolean): string {
  if (track.status === "recording" && !hasLoop) return `Close loop on track ${trackNumber}`;
  if (track.status === "armed" || track.status === "recording") return `Cancel take on track ${trackNumber}`;
  if (track.status === "playing") return `Re-record track ${trackNumber}`;
  return `Record track ${trackNumber}`;
}

const TRIM_LIMIT_MS = TAKE_HANDLE_SECONDS * 1000;
const TRIM_NUDGE_MS = 10;

interface HintState {
  hasLoop: boolean;
  isCountingIn: boolean;
  isRecordingFirst: boolean;
  canTrim: boolean;
  clickOn: boolean;
}

function getHint({ hasLoop, isCountingIn, isRecordingFirst, canTrim, clickOn }: HintState): string {
  if (isCountingIn) return "Count-in: start playing on the next downbeat.";
  if (isRecordingFirst && clickOn) return "Play your part, then tap again. The loop closes on the nearest bar line.";
  if (isRecordingFirst) return "Play your part, then tap again to close the loop.";
  if (!hasLoop && clickOn) return "Tap record for a one-bar count-in, play, then tap again to close the loop.";
  if (!hasLoop) return "Tap record on any track, play, then tap again to set the loop length.";
  if (canTrim) return "Move the loop edges until it feels right, then record another track.";
  return "Other tracks start on the next loop and record one full pass.";
}

function formatOffsetMs(ms: number): string {
  if (ms === 0) return "0 ms";
  return `${ms > 0 ? "+" : "−"}${Math.abs(ms)} ms`;
}

interface TrimControlProps {
  edge: "start" | "end";
  valueMs: number;
  /** One beat when the loop is on a tempo grid, so the end moves a whole beat at a time. */
  beatMs?: number;
  onChange: (valueMs: number) => void;
}

function TrimControl({ edge, valueMs, beatMs, onChange }: TrimControlProps) {
  const label = edge === "start" ? "Start" : "End";
  const name = `loop ${edge}`;
  const stepMs = beatMs ?? TRIM_NUDGE_MS;
  const stepName = beatMs ? "one beat" : `${TRIM_NUDGE_MS} ms`;

  return (
    <div className="looper-trim__row">
      <span className="looper-trim__label">
        {label} <output data-testid={`loop-${edge}-offset`}>{formatOffsetMs(valueMs)}</output>
      </span>
      <button
        type="button"
        className="looper-track__icon-button"
        onClick={() => onChange(valueMs - stepMs)}
        disabled={valueMs <= -TRIM_LIMIT_MS}
        aria-label={`Move ${name} ${stepName} earlier`}
      >
        <Minus size={16} aria-hidden="true" />
      </button>
      <input
        type="range"
        min={-TRIM_LIMIT_MS}
        max={TRIM_LIMIT_MS}
        step={5}
        value={valueMs}
        aria-label={`${label === "Start" ? "Loop start" : "Loop end"} offset in milliseconds`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <button
        type="button"
        className="looper-track__icon-button"
        onClick={() => onChange(valueMs + stepMs)}
        disabled={valueMs >= TRIM_LIMIT_MS}
        aria-label={`Move ${name} ${stepName} later`}
      >
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function Looper() {
  const {
    tracks,
    loopTrim,
    canUndo,
    loopDurationS,
    isPlaying,
    isStarting,
    error,
    latencyNudgeMs,
    setLatencyNudgeMs,
    toggleRecord,
    toggleMute,
    setVolume,
    clearTrack,
    clearAll,
    togglePlayback,
    getLoopPosition,
    setLoopTrim,
    resetLoopTrim,
    undoLastTake,
    metronome,
    grid,
    setClickOn,
    setBpm,
    setBeatsPerBar,
    tapTempo,
    fitTempoToLoop,
    scaleTempo,
    getBeatPosition,
  } = useLooper();
  const progressRef = useRef<HTMLDivElement>(null);
  const hasLoop = loopDurationS !== null;
  const isCountingIn = !hasLoop && tracks.some((track) => track.status === "armed");
  const isRecordingFirst = !hasLoop && tracks.some((track) => track.status === "recording");
  const hasAnyAudio = tracks.some((track) => track.status !== "empty");
  const isAnyTrackBusy = tracks.some((track) => track.status === "armed" || track.status === "recording");

  useEffect(() => {
    const progress = progressRef.current;
    if (!progress) return;

    if (!isPlaying) {
      progress.style.setProperty("--loop-progress", "0");
      return;
    }

    // Drive the playhead straight from the AudioContext clock without re-rendering React.
    let frame = requestAnimationFrame(function draw() {
      const position = getLoopPosition();
      progress.style.setProperty(
        "--loop-progress",
        position ? String(position.positionS / position.durationS) : "0"
      );
      frame = requestAnimationFrame(draw);
    });

    return () => cancelAnimationFrame(frame);
  }, [getLoopPosition, isPlaying]);

  return (
    <section className="looper" aria-label="Looper">
      <div className="looper__transport">
        <div className="looper__progress" ref={progressRef} aria-hidden="true">
          <span className="looper__progress-fill" />
        </div>
        <div className="looper__transport-row">
          <p className="looper__length" data-testid="loop-length">
            {hasLoop ? `Loop ${formatLoopTime(loopDurationS)}` : "No loop yet"}
          </p>
          <div className="looper__transport-actions">
            <button
              type="button"
              className="looper__play"
              onClick={togglePlayback}
              disabled={!hasLoop}
              aria-label={isPlaying ? "Stop loop" : "Play loop"}
            >
              {isPlaying ? (
                <Pause size={18} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <Play size={18} strokeWidth={2.2} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="looper-track__icon-button"
              onClick={undoLastTake}
              disabled={!canUndo || isAnyTrackBusy}
              aria-label="Undo last take"
              title="Undo last take"
            >
              <Undo2 size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="looper__clear-all"
              onClick={clearAll}
              disabled={!hasAnyAudio}
            >
              Clear all
            </button>
          </div>
        </div>
      </div>

      <p className="looper__hint" role="status">
        {isStarting
          ? "Opening the microphone…"
          : getHint({
              hasLoop,
              isCountingIn,
              isRecordingFirst,
              canTrim: loopTrim !== null,
              clickOn: metronome.clickOn,
            })}
      </p>

      <LooperTempo
        metronome={metronome}
        grid={grid}
        hasLoop={hasLoop}
        isBusy={isAnyTrackBusy}
        isTicking={(isPlaying && grid !== null) || (metronome.clickOn && (isCountingIn || isRecordingFirst))}
        setClickOn={setClickOn}
        setBpm={setBpm}
        setBeatsPerBar={setBeatsPerBar}
        tapTempo={tapTempo}
        fitTempoToLoop={fitTempoToLoop}
        scaleTempo={scaleTempo}
        getBeatPosition={getBeatPosition}
      />

      {loopTrim && (
        <fieldset className="looper-trim">
          <legend>Loop edges</legend>
          <TrimControl edge="start" valueMs={loopTrim.startMs} onChange={(startMs) => setLoopTrim({ startMs })} />
          <TrimControl
            edge="end"
            valueMs={loopTrim.endMs}
            beatMs={grid ? (loopDurationS! * 1000) / grid.beats : undefined}
            onChange={(endMs) => setLoopTrim({ endMs })}
          />
          <div className="looper-trim__footer">
            <p>Relative to where you tapped. The edges lock once another track is recorded.</p>
            <button
              type="button"
              className="looper__clear-all"
              onClick={resetLoopTrim}
              disabled={loopTrim.startMs === 0 && loopTrim.endMs === 0}
              aria-label="Reset loop edges"
            >
              Reset
            </button>
          </div>
        </fieldset>
      )}

      <ol className="looper__tracks">
        {tracks.map((track, index) => {
          const trackNumber = index + 1;
          const isBusy = track.status === "armed" || track.status === "recording";
          const blockedByFirstTake = (isRecordingFirst || isCountingIn) && track.status === "empty";

          return (
            <li
              key={trackNumber}
              className={`looper-track looper-track--${track.status} ${track.muted ? "looper-track--muted" : ""}`}
              aria-label={`Track ${trackNumber}`}
            >
              <button
                type="button"
                className="looper-track__record"
                onClick={() => void toggleRecord(index)}
                disabled={isStarting || blockedByFirstTake}
                aria-label={getRecordLabel(track, trackNumber, hasLoop)}
              >
                {track.status === "recording" && !hasLoop ? (
                  <Square size={18} fill="currentColor" aria-hidden="true" />
                ) : isBusy ? (
                  <X size={20} strokeWidth={2.4} aria-hidden="true" />
                ) : (
                  <Circle size={20} fill="currentColor" aria-hidden="true" />
                )}
              </button>

              <div className="looper-track__body">
                <div className="looper-track__heading">
                  <span className="looper-track__name">Track {trackNumber}</span>
                  <span className="looper-track__status" data-testid={`track-${trackNumber}-status`}>
                    {track.status === "armed" && !hasLoop ? "Count-in" : STATUS_COPY[track.status]}
                  </span>
                </div>
                <div className="looper-track__wave" aria-hidden="true">
                  {track.peaks.map((peak, peakIndex) => (
                    <span key={peakIndex} style={{ height: `${Math.max(6, peak * 100)}%` }} />
                  ))}
                </div>
                <input
                  type="range"
                  className="looper-track__volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={track.volume}
                  onChange={(event) => setVolume(index, Number(event.target.value))}
                  aria-label={`Track ${trackNumber} volume`}
                />
              </div>

              <div className="looper-track__actions">
                <button
                  type="button"
                  className="looper-track__icon-button"
                  onClick={() => toggleMute(index)}
                  aria-pressed={track.muted}
                  aria-label={`Mute track ${trackNumber}`}
                >
                  {track.muted ? (
                    <VolumeX size={18} aria-hidden="true" />
                  ) : (
                    <Volume2 size={18} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="looper-track__icon-button"
                  onClick={() => clearTrack(index)}
                  disabled={track.status === "empty"}
                  aria-label={`Clear track ${trackNumber}`}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <details className="looper__settings">
        <summary>Timing</summary>
        <label className="looper__nudge">
          <span>
            Recording offset <output>{latencyNudgeMs} ms</output>
          </span>
          <input
            type="range"
            min={MIN_LATENCY_NUDGE_MS}
            max={MAX_LATENCY_NUDGE_MS}
            step={5}
            value={latencyNudgeMs}
            aria-label="Recording offset in milliseconds"
            onChange={(event) => setLatencyNudgeMs(Number(event.target.value))}
          />
        </label>
        <p>
          If new layers land late, raise this. Bluetooth headphones usually need 150 to 250 ms.
        </p>
      </details>

      <p className="looper__tip">
        Use wired headphones so the loop does not bleed into new takes.
      </p>

      {error && (
        <p className="looper__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
