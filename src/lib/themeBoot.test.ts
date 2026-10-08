import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PALETTE_ID, getPalette } from "./palettes";
import {
  bootTheme,
  getThemeBootConfig,
  getThemeBootScript,
  PALETTE_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "./themeBoot";

function mockSystemTheme(theme: "light" | "dark") {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: query.includes("light") && theme === "light" })),
  );
}

describe("theme boot script", () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
    const root = document.documentElement;
    delete root.dataset.theme;
    delete root.dataset.palette;
    root.style.colorScheme = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("follows the system theme and the default palette with nothing saved", () => {
    mockSystemTheme("dark");
    bootTheme(getThemeBootConfig());

    const root = document.documentElement;
    expect(root.dataset.theme).toBe("dark");
    expect(root.dataset.palette).toBe(DEFAULT_PALETTE_ID);
    expect(root.style.colorScheme).toBe("dark");
    expect(document.querySelector("meta[name='theme-color']")).toHaveAttribute(
      "content",
      getPalette(DEFAULT_PALETTE_ID).themeColor.dark,
    );
  });

  it("applies a saved theme and palette over the system theme", () => {
    mockSystemTheme("dark");
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    localStorage.setItem(PALETTE_STORAGE_KEY, "chasm");
    bootTheme(getThemeBootConfig());

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.palette).toBe("chasm");
    expect(document.querySelector("meta[name='theme-color']")).toHaveAttribute(
      "content",
      getPalette("chasm").themeColor.light,
    );
  });

  it("ignores a retired palette and junk theme values", () => {
    mockSystemTheme("light");
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    localStorage.setItem(PALETTE_STORAGE_KEY, "retired-palette");
    bootTheme(getThemeBootConfig());

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.palette).toBe(DEFAULT_PALETTE_ID);
  });

  it("still sets a theme when storage is blocked", () => {
    mockSystemTheme("dark");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    bootTheme(getThemeBootConfig());

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.palette).toBe(DEFAULT_PALETTE_ID);
  });

  it("runs on its own as the inlined script", () => {
    mockSystemTheme("dark");
    localStorage.setItem(PALETTE_STORAGE_KEY, "paper-8");
    new Function(getThemeBootScript())();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.palette).toBe("paper-8");
  });
});
