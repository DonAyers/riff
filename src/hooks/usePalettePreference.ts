import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PALETTE_ID, isPaletteId, type PaletteId } from "../lib/palettes";
import {
  CUSTOM_PALETTE_ID,
  CUSTOM_PALETTE_STORAGE_KEY,
  CUSTOM_PALETTE_STYLE_ID,
  parseStoredPalette,
  toStoredPalette,
  type CustomPalette,
} from "../lib/customPalette";
import { PALETTE_STORAGE_KEY } from "../lib/themeBoot";
import { syncThemeColorMeta } from "./useThemePreference";

export { PALETTE_STORAGE_KEY };

/** A built-in palette id, or "custom" for the user's own imported palette. */
export type PaletteChoice = PaletteId | typeof CUSTOM_PALETTE_ID;

export function readCustomPalette(): CustomPalette | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStoredPalette(window.localStorage.getItem(CUSTOM_PALETTE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readPalettePreference(): PaletteChoice {
  if (typeof window === "undefined") return DEFAULT_PALETTE_ID;

  try {
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    if (stored === CUSTOM_PALETTE_ID) return readCustomPalette() ? CUSTOM_PALETTE_ID : DEFAULT_PALETTE_ID;
    return isPaletteId(stored) ? stored : DEFAULT_PALETTE_ID;
  } catch {
    // Storage can be blocked (private mode, site data disabled); fall back to the default.
    return DEFAULT_PALETTE_ID;
  }
}

/**
 * Writes (or removes) the <style> element holding the custom palette's tokens. Its
 * data-light/data-dark attributes carry the browser chrome colours for syncThemeColorMeta.
 */
export function applyCustomPaletteStyle(palette: CustomPalette | null): void {
  if (typeof document === "undefined") return;

  let style = document.getElementById(CUSTOM_PALETTE_STYLE_ID);
  if (!palette) {
    style?.remove();
    return;
  }
  const stored = toStoredPalette(palette);
  if (!style) {
    style = document.createElement("style");
    style.id = CUSTOM_PALETTE_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = stored.css;
  style.dataset.light = stored.themeColor.light;
  style.dataset.dark = stored.themeColor.dark;
}

export function applyDocumentPalette(palette: PaletteChoice): void {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.palette = palette;
  syncThemeColorMeta();
}

/** Applies the saved palette before React renders so the first paint uses it. */
export function initializePalettePreference(): void {
  applyCustomPaletteStyle(readCustomPalette());
  applyDocumentPalette(readPalettePreference());
}

export function usePalettePreference() {
  const [palette, setPaletteState] = useState<PaletteChoice>(readPalettePreference);
  const [customPalette, setCustomPaletteState] = useState<CustomPalette | null>(readCustomPalette);

  useEffect(() => {
    applyCustomPaletteStyle(customPalette);
    applyDocumentPalette(palette);
  }, [customPalette, palette]);

  const setPalette = useCallback((next: PaletteChoice) => {
    try {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, next);
    } catch {
      // Still switch for this visit even if it can't be saved.
    }
    setPaletteState(next);
  }, []);

  /** Saves the custom palette and switches to it. */
  const setCustomPalette = useCallback(
    (next: CustomPalette) => {
      try {
        window.localStorage.setItem(CUSTOM_PALETTE_STORAGE_KEY, JSON.stringify(toStoredPalette(next)));
      } catch {
        // Still applies for this visit even if it can't be saved.
      }
      setCustomPaletteState(next);
      setPalette(CUSTOM_PALETTE_ID);
    },
    [setPalette]
  );

  return { palette, setPalette, customPalette, setCustomPalette };
}
