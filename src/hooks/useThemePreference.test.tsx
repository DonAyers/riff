import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyDocumentTheme,
  initializeThemePreference,
  readThemeOverride,
  useThemePreference,
} from "./useThemePreference";

const LIGHT_QUERY = "(prefers-color-scheme: light)";

function installMatchMedia(initialLightMode: boolean) {
  let isLightMode = initialLightMode;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQueryList = {
    media: LIGHT_QUERY,
    onchange: null,
    get matches() {
      return isLightMode;
    },
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "change") {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === "change") {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    }),
    removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    }),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  vi.stubGlobal("matchMedia", vi.fn(() => mediaQueryList));

  return {
    mediaQueryList,
    setLightMode(nextIsLightMode: boolean) {
      isLightMode = nextIsLightMode;
      const event = { matches: isLightMode, media: LIGHT_QUERY } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function resetDocumentTheme() {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.style.colorScheme = "";
  document.querySelector("meta[name='theme-color']")?.remove();
}

describe("useThemePreference", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDocumentTheme();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetDocumentTheme();
  });

  it("falls back to the system theme when storage is blocked", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readThemeOverride()).toBeNull();
    expect(() => initializeThemePreference()).not.toThrow();
    getItem.mockRestore();
  });

  it("follows the OS theme and reacts to OS preference changes when no override exists", () => {
    const matchMedia = installMatchMedia(false);

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.theme).toBe("dark");
    expect(result.current.source).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => matchMedia.setLightMode(true));

    expect(result.current.theme).toBe("light");
    expect(result.current.source).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("persists an in-app override and keeps it when the OS preference changes", () => {
    const matchMedia = installMatchMedia(false);

    const { result, unmount } = renderHook(() => useThemePreference());

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe("light");
    expect(result.current.source).toBe("override");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    act(() => matchMedia.setLightMode(false));

    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    unmount();
    const { result: restored } = renderHook(() => useThemePreference());

    expect(restored.current.theme).toBe("light");
    expect(restored.current.source).toBe("override");
  });

  it("can clear an override and return to the current OS theme", () => {
    installMatchMedia(true);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.theme).toBe("dark");
    expect(result.current.source).toBe("override");

    act(() => result.current.clearThemeOverride());

    expect(result.current.theme).toBe("light");
    expect(result.current.source).toBe("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("applies the initial theme before React renders", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    installMatchMedia(true);

    initializeThemePreference();

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    // Default palette (Vanilla Milkshake) background for each mode.
    expect(meta).toHaveAttribute("content", "#fff7e4");

    applyDocumentTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(meta).toHaveAttribute("content", "#28282e");
  });

  it("matches the browser chrome colour to the selected palette", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    document.documentElement.dataset.palette = "chasm";

    applyDocumentTheme("dark");
    expect(meta).toHaveAttribute("content", "#32313b");

    document.documentElement.dataset.palette = "not-a-palette";
    applyDocumentTheme("dark");
    expect(meta).toHaveAttribute("content", "#28282e");
  });
});
