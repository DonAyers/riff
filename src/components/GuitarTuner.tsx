import { useEffect, type CSSProperties } from "react";
import { Gauge, Lock, Minus, Plus, Power } from "lucide-react";
import { useGuitarTuner } from "../hooks/useGuitarTuner";
import { MAX_A4_HZ, MIN_A4_HZ, TUNING_PRESETS, type TuningReading } from "../lib/guitarTuner";
import "./GuitarTuner.css";

interface GuitarTunerProps {
  disabled?: boolean;
}

type TunerTone = "idle" | "far" | "close" | "in-tune";

const METER_RANGE_CENTS = 50;
const CLOSE_RANGE_CENTS = 15;
const METER_TICKS = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50] as const;

export function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) {
    return "0¢";
  }

  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}¢`;
}

function getTone(reading: TuningReading | null): TunerTone {
  if (!reading) return "idle";
  if (reading.inTune) return "in-tune";
  return Math.abs(reading.cents) <= CLOSE_RANGE_CENTS ? "close" : "far";
}

function getHint(reading: TuningReading | null, isListening: boolean): string {
  if (!isListening) return "Tap start, then pluck one string";
  if (!reading) return "Pluck one string";
  if (reading.held) return reading.inTune ? "In tune" : "Pluck again";
  if (reading.inTune) return "In tune";
  return reading.cents < 0 ? "Tune up" : "Tune down";
}

function splitNote(note: string): { pitchClass: string; octave: string } {
  const match = /^(.*?)(-?\d+)$/.exec(note);
  return match ? { pitchClass: match[1], octave: match[2] } : { pitchClass: note, octave: "" };
}

interface TunerMeterProps {
  cents: number;
  hasReading: boolean;
  meterText: string;
}

function TunerMeter({ cents, hasReading, meterText }: TunerMeterProps) {
  const clampedCents = Math.max(-METER_RANGE_CENTS, Math.min(METER_RANGE_CENTS, cents));
  const needleStyle = {
    "--needle-position": `${50 + (clampedCents / METER_RANGE_CENTS) * 50}%`,
  } as CSSProperties;

  return (
    <div
      className="guitar-tuner__meter"
      role="meter"
      aria-label="Tuning cents"
      aria-valuemin={-METER_RANGE_CENTS}
      aria-valuemax={METER_RANGE_CENTS}
      aria-valuenow={Math.round(clampedCents)}
      aria-valuetext={meterText}
    >
      <div className="guitar-tuner__meter-track" aria-hidden="true">
        <span className="guitar-tuner__meter-zone guitar-tuner__meter-zone--close" />
        <span className="guitar-tuner__meter-zone guitar-tuner__meter-zone--in-tune" />
        {METER_TICKS.map((tick) => (
          <span
            key={tick}
            className={`guitar-tuner__meter-tick ${tick === 0 ? "guitar-tuner__meter-tick--center" : ""}`}
            style={{ left: `${50 + (tick / METER_RANGE_CENTS) * 50}%` }}
          />
        ))}
        {hasReading && <span className="guitar-tuner__needle" style={needleStyle} />}
      </div>
      <div className="guitar-tuner__meter-scale" aria-hidden="true">
        <span>♭ flat</span>
        <span>0</span>
        <span>sharp ♯</span>
      </div>
    </div>
  );
}

export function GuitarTuner({ disabled = false }: GuitarTunerProps) {
  const {
    state,
    reading,
    error,
    start,
    stop,
    tuning,
    setTuningId,
    strings,
    a4Hz,
    setA4Hz,
    lockedStringId,
    setLockedStringId,
  } = useGuitarTuner();
  const isListening = state === "listening";
  const tone = getTone(reading);
  const hint = getHint(reading, isListening);
  const lockedString = strings.find((string) => string.id === lockedStringId) ?? null;
  const displayTarget = reading?.target ?? lockedString;
  const { pitchClass, octave } = splitNote(displayTarget?.note ?? "—");
  const meterText = reading
    ? `${formatCents(reading.cents)} ${reading.inTune ? "in tune" : reading.cents < 0 ? "flat" : "sharp"}`
    : "No stable pitch";

  useEffect(() => {
    if (disabled && isListening) {
      stop();
    }
  }, [disabled, isListening, stop]);

  useEffect(() => stop, [stop]);

  return (
    <section
      className={`guitar-tuner guitar-tuner--${tone} ${reading?.held ? "guitar-tuner--held" : ""}`}
      aria-label="Guitar tuner"
    >
      <div className="guitar-tuner__settings">
        <label className="guitar-tuner__field">
          <span className="guitar-tuner__field-label">Tuning</span>
          <select
            className="guitar-tuner__select"
            value={tuning.id}
            onChange={(event) => setTuningId(event.target.value)}
          >
            {TUNING_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <div className="guitar-tuner__field" role="group" aria-label="Reference pitch">
          <span className="guitar-tuner__field-label">A4</span>
          <div className="guitar-tuner__stepper">
            <button
              type="button"
              onClick={() => setA4Hz(a4Hz - 1)}
              disabled={a4Hz <= MIN_A4_HZ}
              aria-label="Lower reference pitch"
            >
              <Minus size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <output aria-live="polite">{a4Hz} Hz</output>
            <button
              type="button"
              onClick={() => setA4Hz(a4Hz + 1)}
              disabled={a4Hz >= MAX_A4_HZ}
              aria-label="Raise reference pitch"
            >
              <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="guitar-tuner__readout">
        <div
          className={`guitar-tuner__note ${displayTarget ? "" : "guitar-tuner__note--empty"}`}
          data-testid="tuner-note"
        >
          <span className="guitar-tuner__note-name">{pitchClass}</span>
          {octave && <span className="guitar-tuner__note-octave">{octave}</span>}
        </div>
        <p className="guitar-tuner__hint" role="status" data-testid="tuner-hint">
          {hint}
        </p>
        <p className="guitar-tuner__numbers">
          <span>{reading ? formatCents(reading.cents) : "— ¢"}</span>
          <span aria-hidden="true">·</span>
          <span>{reading ? `${reading.frequencyHz.toFixed(1)} Hz` : "— Hz"}</span>
        </p>
      </div>

      <TunerMeter cents={reading?.cents ?? 0} hasReading={reading !== null} meterText={meterText} />

      <div className="guitar-tuner__strings" role="group" aria-label="Strings">
        <button
          type="button"
          className={`guitar-tuner__string guitar-tuner__string--auto ${lockedStringId === null ? "guitar-tuner__string--selected" : ""}`}
          aria-pressed={lockedStringId === null}
          onClick={() => setLockedStringId(null)}
        >
          Auto
        </button>
        {strings.map((string) => {
          const isLocked = string.id === lockedStringId;
          const isDetected = string.id === reading?.target.id;

          return (
            <button
              key={string.id}
              type="button"
              className={[
                "guitar-tuner__string",
                isLocked ? "guitar-tuner__string--selected" : "",
                isDetected ? "guitar-tuner__string--active" : "",
              ].filter(Boolean).join(" ")}
              aria-pressed={isLocked}
              aria-label={`${string.label} string (${string.note})${isLocked ? ", locked" : ""}`}
              title={`Lock to ${string.note}`}
              onClick={() => setLockedStringId(isLocked ? null : string.id)}
            >
              {isLocked && <Lock size={10} strokeWidth={2.4} aria-hidden="true" />}
              {splitNote(string.note).pitchClass}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`tuner-toggle ${isListening ? "listening" : ""}`}
        onClick={() => {
          if (isListening) {
            stop();
            return;
          }

          void start();
        }}
        disabled={disabled}
        aria-label={isListening ? "Stop tuner" : "Start tuner"}
      >
        {isListening ? (
          <Power size={16} strokeWidth={2} aria-hidden="true" />
        ) : (
          <Gauge size={16} strokeWidth={2} aria-hidden="true" />
        )}
        {isListening ? "Stop tuner" : "Start tuner"}
      </button>

      {error && <p className="guitar-tuner__error" role="alert">{error}</p>}
    </section>
  );
}
