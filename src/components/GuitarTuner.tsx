import { useEffect, useState, type CSSProperties } from "react";
import { Gauge, Power } from "lucide-react";
import { useGuitarTuner } from "../hooks/useGuitarTuner";
import { STANDARD_GUITAR_STRINGS } from "../lib/guitarTuner";
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

const STRING_THICKNESS_PX = [5, 4.4, 3.6, 2.8, 2.2, 1.7] as const;
const TUNER_FEEDBACK_STYLES = [
  { id: "classic", label: "Bars", barCount: 25 },
  { id: "fine", label: "Fine", barCount: 49 },
  { id: "fluid", label: "Fluid", barCount: 0 },
] as const;

type TunerFeedbackStyle = (typeof TUNER_FEEDBACK_STYLES)[number]["id"];

interface GuitarTunerStringDotsProps {
  activeStringId?: string;
}

function GuitarTunerStringDots({ activeStringId }: GuitarTunerStringDotsProps) {
  const activeString = STANDARD_GUITAR_STRINGS.find((string) => string.id === activeStringId);
  const ariaLabel = activeString
    ? `${activeString.label} string active in guitar string dots`
    : "Guitar string dots waiting for a detected string";

  return (
    <div className="guitar-tuner__strings" role="img" aria-label={ariaLabel}>
      <div className="guitar-tuner__strings-track" aria-hidden="true">
        {STANDARD_GUITAR_STRINGS.map((string, stringIndex) => {
          const isActive = string.id === activeStringId;
          const stringStyle = {
            "--string-thickness": `${STRING_THICKNESS_PX[stringIndex]}px`,
          } as CSSProperties;

          return (
            <span
              key={string.id}
              className={`guitar-tuner__string-dot-row ${isActive ? "guitar-tuner__string-dot-row--active" : ""}`}
              style={stringStyle}
            >
              <span className="guitar-tuner__string-dot" />
              <span className="guitar-tuner__string-label">{string.note.replace(/\d$/, "")}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface GuitarTunerBarMeterProps {
  cents: number;
  feedbackStyle: TunerFeedbackStyle;
  hasReading: boolean;
  isInTune: boolean;
  meterText: string;
}

function GuitarTunerBarMeter({
  cents,
  feedbackStyle,
  hasReading,
  isInTune,
  meterText,
}: GuitarTunerBarMeterProps) {
  const feedbackConfig =
    TUNER_FEEDBACK_STYLES.find((style) => style.id === feedbackStyle) ??
    TUNER_FEEDBACK_STYLES[0];
  const barCount = feedbackConfig.barCount;
  const centerBarIndex = Math.floor(barCount / 2);
  const activeOffset = Math.round((Math.abs(cents) / 50) * centerBarIndex);
  const activeStart = cents < 0 ? centerBarIndex - activeOffset : centerBarIndex;
  const activeEnd = cents < 0 ? centerBarIndex : centerBarIndex + activeOffset;
  const fluidMarkerPercent = 50 + cents;
  const fluidStartPercent = Math.min(50, fluidMarkerPercent);
  const fluidWidthPercent = Math.abs(fluidMarkerPercent - 50);
  const fluidStyle = {
    "--fluid-marker": `${fluidMarkerPercent}%`,
    "--fluid-start": `${fluidStartPercent}%`,
    "--fluid-width": `${hasReading ? fluidWidthPercent : 0}%`,
  } as CSSProperties;
  const barRowStyle = {
    gridTemplateColumns: `repeat(${barCount}, minmax(${feedbackStyle === "fine" ? "2px" : "3px"}, 1fr))`,
  } as CSSProperties;

  return (
    <div
      className={`guitar-tuner__bar-meter guitar-tuner__bar-meter--${feedbackStyle} ${isInTune ? "guitar-tuner__bar-meter--in-tune" : ""}`}
      role="meter"
      aria-label="Tuning cents"
      aria-valuemin={-50}
      aria-valuemax={50}
      aria-valuenow={Math.round(cents)}
      aria-valuetext={meterText}
    >
      {feedbackStyle === "fluid" ? (
        <div className="guitar-tuner__fluid-row" aria-hidden="true" style={fluidStyle}>
          <span
            className={`guitar-tuner__fluid-track ${hasReading ? "guitar-tuner__fluid-track--active" : ""}`}
          >
            <span className="guitar-tuner__fluid-fill" />
            <span className="guitar-tuner__fluid-marker" />
          </span>
        </div>
      ) : (
        <div
          className={`guitar-tuner__bar-row ${feedbackStyle === "fine" ? "guitar-tuner__bar-row--fine" : ""}`}
          aria-hidden="true"
          style={barRowStyle}
        >
          {Array.from({ length: barCount }, (_, index) => {
            const distanceFromCenter = Math.abs(index - centerBarIndex);
            const isCenter = index === centerBarIndex;
            const isActive = hasReading && index >= activeStart && index <= activeEnd;
            const baseHeight = feedbackStyle === "fine" ? 34 : 42;
            const heightStep = feedbackStyle === "fine" ? 1.6 : 3.2;
            const barStyle = {
              "--bar-height": `${baseHeight + (centerBarIndex - distanceFromCenter) * heightStep}px`,
            } as CSSProperties;

            return (
              <span
                key={index}
                className={`guitar-tuner__bar ${isCenter ? "guitar-tuner__bar--center" : ""} ${isActive ? "guitar-tuner__bar--active" : ""}`}
                style={barStyle}
              />
            );
          })}
        </div>
      )}
      <div className="guitar-tuner__meter-scale" aria-hidden="true">
        <span>-50</span>
        <span>0</span>
        <span>+50</span>
      </div>
    </div>
  );
}

export function GuitarTuner({ disabled = false }: GuitarTunerProps) {
  const { state, reading, error, start, stop } = useGuitarTuner();
  const [feedbackStyle, setFeedbackStyle] = useState<TunerFeedbackStyle>("classic");
  const isListening = state === "listening";
  const clampedCents = Math.max(-50, Math.min(50, reading?.cents ?? 0));
  const displayNote = reading?.target.note ?? "—";
  const displayFrequency = reading ? `${reading.frequencyHz.toFixed(1)} Hz` : "-- Hz";
  const displayCents = reading ? formatCents(reading.cents) : "No pitch";
  const isInTune = reading?.inTune === true;
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
      <div className="guitar-tuner__topline">
        <div className="guitar-tuner__copy">
          <span className="guitar-tuner__eyebrow">Guitar tuner</span>
          <h3 className="guitar-tuner__title">Tune before you record</h3>
        </div>
        <span className={`guitar-tuner__status ${isListening ? "guitar-tuner__status--listening" : ""}`}>
          {isListening ? "Listening" : "Ready"}
        </span>
      </div>

      <div className="guitar-tuner__console">
        <GuitarTunerStringDots activeStringId={reading?.target.id} />

        <div className="guitar-tuner__display" aria-live="polite">
          <div className="guitar-tuner__readout">
            <span className="guitar-tuner__readout-item">{displayFrequency}</span>
            <span className="guitar-tuner__in-tune-slot" aria-hidden="true">
              {isInTune && <span className="guitar-tuner__in-tune-burst">👍</span>}
            </span>
            <span className="guitar-tuner__readout-item">{displayCents}</span>
          </div>

          <GuitarTunerBarMeter
            cents={clampedCents}
            feedbackStyle={feedbackStyle}
            hasReading={reading !== null}
            isInTune={isInTune}
            meterText={meterText}
          />

          <div className="guitar-tuner__feedback-control" role="group" aria-label="Feedback style">
            {TUNER_FEEDBACK_STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                className={`guitar-tuner__feedback-option ${feedbackStyle === style.id ? "guitar-tuner__feedback-option--active" : ""}`}
                onClick={() => setFeedbackStyle(style.id)}
                aria-pressed={feedbackStyle === style.id}
              >
                {style.label}
              </button>
            ))}
          </div>

          <div className={`guitar-tuner__note ${reading ? "" : "guitar-tuner__note--empty"} ${isInTune ? "in-tune" : ""}`}>
            {displayNote}
          </div>
          <div className="guitar-tuner__meta">
            {reading ? (
              <span>{reading.target.label} string</span>
            ) : (
              <span>{isListening ? "Play one string at a time" : "Ready to listen"}</span>
            )}
          </div>
        </div>
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
