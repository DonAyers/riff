import { CUSTOM_PALETTE_ID, CUSTOM_PALETTE_STORAGE_KEY, CUSTOM_PALETTE_STYLE_ID } from "./customPalette";
import { DEFAULT_PALETTE_ID, PALETTES } from "./palettes";

export const THEME_STORAGE_KEY = "riff:theme-preference";
export const PALETTE_STORAGE_KEY = "riff:palette";

export interface ThemeBootConfig {
  themeKey: string;
  paletteKey: string;
  defaultPalette: string;
  /** The user's imported palette: its id, storage key and <style> element id. */
  custom: { id: string; key: string; styleId: string };
  /** Browser chrome colour per palette and mode. */
  themeColors: Record<string, { light: string; dark: string }>;
}

export function getThemeBootConfig(): ThemeBootConfig {
  return {
    themeKey: THEME_STORAGE_KEY,
    paletteKey: PALETTE_STORAGE_KEY,
    defaultPalette: DEFAULT_PALETTE_ID,
    custom: { id: CUSTOM_PALETTE_ID, key: CUSTOM_PALETTE_STORAGE_KEY, styleId: CUSTOM_PALETTE_STYLE_ID },
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
  let custom: { css?: unknown; themeColor?: { light?: unknown; dark?: unknown } } | null = null;
  try {
    theme = window.localStorage.getItem(config.themeKey);
    palette = window.localStorage.getItem(config.paletteKey);
    if (palette === config.custom.id) custom = JSON.parse(window.localStorage.getItem(config.custom.key) || "null");
  } catch {
    // Storage can be blocked (private mode, site data disabled); use the defaults.
  }
  if (theme !== "light" && theme !== "dark") {
    theme =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark";
  }
  const isColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);
  let themeColor: string | null = null;
  if (
    palette === config.custom.id &&
    custom &&
    typeof custom.css === "string" &&
    // Only CSS the app generated: custom-palette rules with plain colour values, nothing that loads or escapes.
    custom.css.indexOf(':root[data-palette="' + config.custom.id + '"]') === 0 &&
    !/[<@\\]|url\(/i.test(custom.css) &&
    isColor(custom.themeColor?.light) &&
    isColor(custom.themeColor?.dark)
  ) {
    // The app regenerates this from the saved roles once it loads; this just paints it first.
    const style = document.createElement("style");
    style.id = config.custom.styleId;
    style.textContent = custom.css;
    style.dataset.light = custom.themeColor.light;
    style.dataset.dark = custom.themeColor.dark;
    document.head.appendChild(style);
    themeColor = theme === "light" ? custom.themeColor.light : custom.themeColor.dark;
  } else if (!palette || !Object.prototype.hasOwnProperty.call(config.themeColors, palette)) {
    palette = config.defaultPalette;
  }
  root.dataset.theme = theme;
  root.dataset.palette = palette;
  root.style.colorScheme = theme;
  const meta = document.querySelector("meta[name='theme-color']");
  if (meta) meta.setAttribute("content", themeColor ?? config.themeColors[palette][theme as "light" | "dark"]);
}

/** The inline <script> body for index.html. */
export function getThemeBootScript(config: ThemeBootConfig = getThemeBootConfig()): string {
  return `(${bootTheme.toString()})(${JSON.stringify(config)});`;
}
