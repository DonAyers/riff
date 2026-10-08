import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CUSTOM_PALETTE_STORAGE_KEY, autoMapRoles, type CustomPalette } from "../lib/customPalette";
import {
  PALETTE_STORAGE_KEY,
  initializePalettePreference,
  readPalettePreference,
  usePalettePreference,
} from "./usePalettePreference";

const COLORS = ["#fff1e8", "#000000", "#ff004d", "#29adff", "#00e436"];
const CUSTOM: CustomPalette = { name: "Mini PICO", colors: COLORS, roles: autoMapRoles(COLORS) };

function resetDocument() {
  document.getElementById("riff-custom-palette")?.remove();
  document.documentElement.removeAttribute("data-palette");
  document.documentElement.removeAttribute("data-theme");
  document.querySelector("meta[name='theme-color']")?.remove();
}

describe("usePalettePreference", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDocument();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDocument();
  });

  it("defaults to Vanilla Milkshake when nothing is saved", () => {
    const { result } = renderHook(() => usePalettePreference());

    expect(result.current.palette).toBe("vanilla-milkshake");
    expect(document.documentElement.dataset.palette).toBe("vanilla-milkshake");
  });

  it("saves the chosen palette and restores it on the next visit", () => {
    const { result, unmount } = renderHook(() => usePalettePreference());

    act(() => result.current.setPalette("chasm"));

    expect(result.current.palette).toBe("chasm");
    expect(document.documentElement.dataset.palette).toBe("chasm");
    expect(localStorage.getItem(PALETTE_STORAGE_KEY)).toBe("chasm");

    unmount();
    const { result: restored } = renderHook(() => usePalettePreference());
    expect(restored.current.palette).toBe("chasm");
  });

  it("ignores a saved palette that no longer exists", () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, "retired-palette");

    expect(readPalettePreference()).toBe("vanilla-milkshake");
  });

  it("falls back to the default when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(readPalettePreference()).toBe("vanilla-milkshake");
  });

  it("still switches palette for this visit when saving fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const { result } = renderHook(() => usePalettePreference());

    act(() => result.current.setPalette("paper-8"));

    expect(result.current.palette).toBe("paper-8");
    expect(document.documentElement.dataset.palette).toBe("paper-8");
  });

  it("applies the saved palette and browser colour before React renders", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    document.documentElement.dataset.theme = "light";
    localStorage.setItem(PALETTE_STORAGE_KEY, "slowshout");

    initializePalettePreference();

    expect(document.documentElement.dataset.palette).toBe("slowshout");
    expect(meta).toHaveAttribute("content", "#eedebe");
  });

  it("saves an imported palette, switches to it and restores it on the next visit", () => {
    const { result, unmount } = renderHook(() => usePalettePreference());

    act(() => result.current.setCustomPalette(CUSTOM));

    expect(result.current.palette).toBe("custom");
    expect(document.documentElement.dataset.palette).toBe("custom");
    const style = document.getElementById("riff-custom-palette");
    expect(style?.textContent).toContain(':root[data-palette="custom"]');
    expect(style?.textContent).toContain("--accent: #ff004d;");
    expect(JSON.parse(localStorage.getItem(CUSTOM_PALETTE_STORAGE_KEY)!)).toMatchObject({ name: "Mini PICO" });

    unmount();
    resetDocument();
    const { result: restored } = renderHook(() => usePalettePreference());
    expect(restored.current.palette).toBe("custom");
    expect(restored.current.customPalette?.name).toBe("Mini PICO");
    expect(document.getElementById("riff-custom-palette")).not.toBeNull();
  });

  it("points the browser colour at the custom palette's background", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    document.documentElement.dataset.theme = "light";
    const { result } = renderHook(() => usePalettePreference());

    act(() => result.current.setCustomPalette(CUSTOM));

    expect(meta).toHaveAttribute("content", "#fff1e8");
  });

  it("falls back to the default when the custom palette is selected but missing", () => {
    localStorage.setItem(PALETTE_STORAGE_KEY, "custom");
    expect(readPalettePreference()).toBe("vanilla-milkshake");

    localStorage.setItem(CUSTOM_PALETTE_STORAGE_KEY, "{broken");
    expect(readPalettePreference()).toBe("vanilla-milkshake");
  });

  it("keeps the imported palette when switching back to a built-in one", () => {
    const { result } = renderHook(() => usePalettePreference());

    act(() => result.current.setCustomPalette(CUSTOM));
    act(() => result.current.setPalette("chasm"));

    expect(document.documentElement.dataset.palette).toBe("chasm");
    expect(result.current.customPalette?.name).toBe("Mini PICO");
  });
});
