import { DEFAULT_PALETTE_ID, PALETTES } from "./palettes";

export const THEME_STORAGE_KEY = "riff:theme-preference";
export const PALETTE_STORAGE_KEY = "riff:palette";

export interface ThemeBootConfig {
  themeKey: string;
  paletteKey: string;
  defaultPalette: string;
  /** Browser chrome colour per palette and mode. */
  themeColors: Record<string, { light: string; dark: string }>;
}

export function getThemeBootConfig(): ThemeBootConfig {
  return {
    themeKey: THEME_STORAGE_KEY,
    paletteKey: PALETTE_STORAGE_KEY,
    defaultPalette: DEFAULT_PALETTE_ID,
    themeColors: Object.fromEntries(PALETTES.map((palette) => [palette.id, palette.themeColor])),
  };
}

/**
 * Applies the saved theme and palette to <html> before the first paint. It is inlined into
 * index.html as a blocking script (see vite.config.ts), so it must stay self-contained:
 * no imports, no closures over module scope.
 */
export function bootTheme(config: ThemeBootConfig): void {
  const root = document.documentElement;
  let theme: string | null = null;
  let palette: string | null = null;
  try {
    theme = window.localStorage.getItem(config.themeKey);
    palette = window.localStorage.getItem(config.paletteKey);
  } catch {
    // Storage can be blocked (private mode, site data disabled); use the defaults.
  }
  if (theme !== "light" && theme !== "dark") {
    theme =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
  }
  if (!palette || !Object.prototype.hasOwnProperty.call(config.themeColors, palette)) {
    palette = config.defaultPalette;
  }
  root.dataset.theme = theme;
  root.dataset.palette = palette;
  root.style.colorScheme = theme;
  const meta = document.querySelector("meta[name='theme-color']");
  if (meta) meta.setAttribute("content", config.themeColors[palette][theme as "light" | "dark"]);
}

/** The inline <script> body for index.html. */
export function getThemeBootScript(config: ThemeBootConfig = getThemeBootConfig()): string {
  return `(${bootTheme.toString()})(${JSON.stringify(config)});`;
}
