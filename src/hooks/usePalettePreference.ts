import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PALETTE_ID, isPaletteId, type PaletteId } from "../lib/palettes";
import { syncThemeColorMeta } from "./useThemePreference";

export const PALETTE_STORAGE_KEY = "riff:palette";

export function readPalettePreference(): PaletteId {
  if (typeof window === "undefined") return DEFAULT_PALETTE_ID;

  try {
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    return isPaletteId(stored) ? stored : DEFAULT_PALETTE_ID;
  } catch {
    // Storage can be blocked (private mode, site data disabled); fall back to the default.
    return DEFAULT_PALETTE_ID;
  }
}

export function applyDocumentPalette(palette: PaletteId): void {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.palette = palette;
  syncThemeColorMeta();
}

/** Applies the saved palette before React renders so the first paint uses it. */
export function initializePalettePreference(): void {
  applyDocumentPalette(readPalettePreference());
}

export function usePalettePreference() {
  const [palette, setPaletteState] = useState<PaletteId>(readPalettePreference);

  useEffect(() => {
    applyDocumentPalette(palette);
  }, [palette]);

  const setPalette = useCallback((next: PaletteId) => {
    try {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, next);
    } catch {
      // Still switch for this visit even if it can't be saved.
    }
    setPaletteState(next);
  }, []);

  return { palette, setPalette };
}
