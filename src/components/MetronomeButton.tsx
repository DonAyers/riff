import { useCallback, useRef } from "react";
import { Metronome } from "lucide-react";
import type { BeatPosition } from "../hooks/useLooper";
import { useBeatLight } from "../hooks/useBeatLight";

const LONG_PRESS_MS = 450;

interface MetronomeButtonProps {
  clickOn: boolean;
  /** Before the metronome has been set up, a tap opens its settings instead of toggling it. */
  isSetUp: boolean;
  isTicking: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  getBeatPosition: () => BeatPosition | null;
}

/**
 * Tap turns the click on or off; a long press, right-click or Shift+Enter opens its settings.
 * The icon pulses on each beat while the click is running.
 */
export function MetronomeButton({
  clickOn,
  isSetUp,
  isTicking,
  onToggle,
  onOpenSettings,
  getBeatPosition,
}: MetronomeButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);

  const cancelLongPress = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const showBeat = useCallback((beat: number) => {
    if (beat < 0) {
      delete buttonRef.current?.dataset.beat;
    } else if (buttonRef.current) {
      buttonRef.current.dataset.beat = beat === 0 ? "down" : "beat";
    }
  }, []);
  useBeatLight(getBeatPosition, isTicking, showBeat);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="looper__metronome"
      aria-label="Metronome"
      aria-pressed={clickOn}
      aria-keyshortcuts="Shift+Enter"
      title={isSetUp ? "Tap to turn the click on or off. Hold for settings." : "Metronome settings"}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        didLongPressRef.current = false;
        cancelLongPress();
        timerRef.current = window.setTimeout(() => {
          didLongPressRef.current = true;
          timerRef.current = null;
          onOpenSettings();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onContextMenu={(event) => {
        event.preventDefault();
        cancelLongPress();
        onOpenSettings();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          onOpenSettings();
        }
      }}
      onClick={() => {
        // The press that opened the settings should not also toggle the click.
        if (didLongPressRef.current) {
          didLongPressRef.current = false;
          return;
        }
        if (isSetUp) {
          onToggle();
        } else {
          onOpenSettings();
        }
      }}
    >
      <Metronome size={18} strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
