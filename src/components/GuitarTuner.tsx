import { useEffect } from "react";
import { Gauge, Power } from "lucide-react";
import { useGuitarTuner } from "../hooks/useGuitarTuner";
import "./GuitarTuner.css";

interface GuitarTunerProps {
  disabled?: boolean;
}

function formatCents(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) {
    return "0 cents";
  }

  return `${rounded > 0 ? "+" : ""}${rounded} cents`;
}

export function GuitarTuner({ disabled = false }: GuitarTunerProps) {
  const { state, reading, error, start, stop } = useGuitarTuner();
  const isListening = state === "listening";
  const clampedCents = Math.max(-50, Math.min(50, reading?.cents ?? 0));
  const meterText = reading
    ? `${formatCents(reading.cents)} ${reading.cents < 0 ? "flat" : reading.cents > 0 ? "sharp" : "in tune"}`
    : "No stable pitch";

  useEffect(() => {
    if (disabled && isListening) {
      stop();
    }
  }, [disabled, isListening, stop]);

  useEffect(() => stop, [stop]);

  return (
    <section className="guitar-tuner" aria-label="Guitar tuner">
      <div className="guitar-tuner__copy">
        <span className="guitar-tuner__eyebrow">Guitar tuner</span>
        <h3 className="guitar-tuner__title">Tune before you record</h3>
        <p className="guitar-tuner__description">
          A low-latency, open-source pitch detector listens locally and targets standard EADGBE tuning.
        </p>
      </div>

      <div className="guitar-tuner__display" aria-live="polite">
        <div className={`guitar-tuner__note ${reading?.inTune ? "in-tune" : ""}`}>
          {reading?.target.note ?? "—"}
        </div>
        <div className="guitar-tuner__meta">
          {reading ? (
            <>
              <span>{reading.target.label}</span>
              <span>{reading.frequencyHz.toFixed(1)} Hz</span>
              <span>{formatCents(reading.cents)}</span>
            </>
          ) : (
            <span>{isListening ? "Play one string at a time" : "Ready to listen"}</span>
          )}
        </div>
      </div>

      <div
        className="guitar-tuner__meter"
        role="meter"
        aria-label="Tuning cents"
        aria-valuemin={-50}
        aria-valuemax={50}
        aria-valuenow={Math.round(clampedCents)}
        aria-valuetext={meterText}
      >
        <span className="guitar-tuner__meter-mark guitar-tuner__meter-mark--flat">♭</span>
        <span className="guitar-tuner__meter-center" />
        <span className="guitar-tuner__meter-mark guitar-tuner__meter-mark--sharp">♯</span>
        <span
          className="guitar-tuner__needle"
          style={{ transform: `translateX(${clampedCents}%)` }}
        />
      </div>

      <div className="guitar-tuner__actions">
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
            <Power size={15} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Gauge size={15} strokeWidth={2} aria-hidden="true" />
          )}
          {isListening ? "Stop tuner" : "Start tuner"}
        </button>
      </div>

      {error && <p className="guitar-tuner__error">{error}</p>}
    </section>
  );
}
