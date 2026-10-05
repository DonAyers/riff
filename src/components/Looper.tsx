import { useEffect, useRef } from "react";
import { Circle, Pause, Play, Square, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useLooper, type LooperTrackState } from "../hooks/useLooper";
import { formatLoopTime, MAX_LATENCY_NUDGE_MS, MIN_LATENCY_NUDGE_MS } from "../lib/looper";
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

function getHint(hasLoop: boolean, isRecordingFirst: boolean): string {
  if (isRecordingFirst) return "Play your part, then tap again to close the loop.";
  if (!hasLoop) return "Tap record on any track, play, then tap again to set the loop length.";
  return "Other tracks start on the next loop and record one full pass.";
}

export function Looper() {
  const {
    tracks,
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
  } = useLooper();
  const progressRef = useRef<HTMLDivElement>(null);
  const hasLoop = loopDurationS !== null;
  const isRecordingFirst = !hasLoop && tracks.some((track) => track.status === "recording");
  const hasAnyAudio = tracks.some((track) => track.status !== "empty");

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
        {isStarting ? "Opening the microphone…" : getHint(hasLoop, isRecordingFirst)}
      </p>

      <ol className="looper__tracks">
        {tracks.map((track, index) => {
          const trackNumber = index + 1;
          const isBusy = track.status === "armed" || track.status === "recording";
          const blockedByFirstTake = isRecordingFirst && track.status !== "recording";

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
                    {STATUS_COPY[track.status]}
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
