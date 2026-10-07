import { useEffect } from "react";
import type { BeatPosition } from "./useLooper";

/**
 * Calls `onBeat` with the beat being heard each time it changes (-1 when none), reading the
 * audio clock every animation frame so the light follows the click without React re-renders.
 */
export function useBeatLight(
  getBeatPosition: () => BeatPosition | null,
  isTicking: boolean,
  onBeat: (beat: number) => void
) {
  useEffect(() => {
    if (!isTicking) return;

    let lastBeat = -2;
    let frame = requestAnimationFrame(function draw() {
      const beat = getBeatPosition()?.beat ?? -1;
      if (beat !== lastBeat) {
        onBeat(beat);
        lastBeat = beat;
      }
      frame = requestAnimationFrame(draw);
    });

    return () => {
      cancelAnimationFrame(frame);
      onBeat(-1);
    };
  }, [getBeatPosition, isTicking, onBeat]);
}
