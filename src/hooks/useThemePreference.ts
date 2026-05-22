import { useCallback, useEffect, useMemo, useState } from "react";

export type ThemeMode = "dark" | "light";
export type ThemeSource = "system" | "override";

export const THEME_STORAGE_KEY = "riff:theme-preference";
const LIGHT_QUERY = "(prefers-color-scheme: light)";
const THEME_COLOR_META = "meta[name='theme-color']";
const THEME_COLORS: Record<ThemeMode, string> = {
  dark: "#0f0f0f",
  light: "#f4ecd6",
};

function canUseWindow(): boolean {
  return typeof window !== "undefined";
}

export function readThemeOverride(): ThemeMode | null {
  if (!canUseWindow()) return null;

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

export function getSystemTheme(): ThemeMode {
  if (!canUseWindow() || typeof window.matchMedia !== "function") {
    return "dark";
  }

  return window.matchMedia(LIGHT_QUERY).matches ? "light" : "dark";
}

export function applyDocumentTheme(theme: ThemeMode): void {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const themeColor = document.querySelector<HTMLMetaElement>(THEME_COLOR_META);
  themeColor?.setAttribute("content", THEME_COLORS[theme]);
}

export function initializeThemePreference(): void {
  applyDocumentTheme(readThemeOverride() ?? getSystemTheme());
}

export function useThemePreference() {
  const [systemTheme, setSystemTheme] = useState<ThemeMode>(getSystemTheme);
  const [overrideTheme, setOverrideTheme] = useState<ThemeMode | null>(readThemeOverride);
  const theme = overrideTheme ?? systemTheme;
  const source: ThemeSource = overrideTheme ? "override" : "system";
  const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";

  useEffect(() => {
    applyDocumentTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!canUseWindow() || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(LIGHT_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "light" : "dark");
    };

    setSystemTheme(mediaQuery.matches ? "light" : "dark");

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const setThemeOverride = useCallback((next: ThemeMode) => {
    if (!canUseWindow()) return;

    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    setOverrideTheme(next);
  }, []);

  const clearThemeOverride = useCallback(() => {
    if (!canUseWindow()) return;

    window.localStorage.removeItem(THEME_STORAGE_KEY);
    setOverrideTheme(null);
    setSystemTheme(getSystemTheme());
  }, []);

  return useMemo(
    () => ({
      clearThemeOverride,
      nextTheme,
      setThemeOverride,
      source,
      systemTheme,
      theme,
      toggleTheme: () => setThemeOverride(nextTheme),
    }),
    [clearThemeOverride, nextTheme, setThemeOverride, source, systemTheme, theme]
  );
}
