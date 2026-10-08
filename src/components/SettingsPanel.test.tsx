import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PALETTES } from "../lib/palettes";
import { autoMapRoles } from "../lib/customPalette";
import { SettingsPanel } from "./SettingsPanel";

function renderPanel(overrides: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const props: Parameters<typeof SettingsPanel>[0] = {
    palette: "vanilla-milkshake",
    onPaletteChange: vi.fn(),
    customPalette: null,
    onCustomPaletteChange: vi.fn(),
    theme: "dark",
    themeSource: "system",
    onThemeChange: vi.fn(),
    ...overrides,
  };
  render(<SettingsPanel {...props} />);
  return props;
}

describe("SettingsPanel", () => {
  it("offers every palette and marks the current one", () => {
    renderPanel({ palette: "chasm" });

    const group = screen.getByRole("group", { name: "Palette" });
    for (const palette of PALETTES) {
      expect(screen.getByRole("radio", { name: new RegExp(palette.name) })).toBeInTheDocument();
    }
    expect(group).toContainElement(screen.getByRole("radio", { name: /chasm/i }));
    expect(screen.getByRole("radio", { name: /chasm/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /vanilla milkshake/i })).not.toBeChecked();
  });

  it("reports the palette the user picks", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("radio", { name: /paper 8/i }));

    expect(props.onPaletteChange).toHaveBeenCalledWith("paper-8");
  });

  it("shows Match system while following the OS and a fixed mode once overridden", () => {
    renderPanel();
    expect(screen.getByRole("radio", { name: "Match system" })).toBeChecked();
    cleanup();

    renderPanel({ theme: "light", themeSource: "override" });
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
  });

  it("reports mode changes", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(props.onThemeChange).toHaveBeenCalledWith("light");
  });

  it("lists an imported palette as a choice once there is one", () => {
    const colors = ["#f4f4f4", "#1a1c2c", "#b13e53", "#41a6f6"];
    const props = renderPanel({
      customPalette: { name: "Sweetie 16", author: "GrafxKid", colors, roles: autoMapRoles(colors) },
    });

    fireEvent.click(screen.getByRole("radio", { name: /sweetie 16/i }));
    expect(props.onPaletteChange).toHaveBeenCalledWith("custom");
    expect(screen.getByRole("group", { name: "Your own palette" })).toBeInTheDocument();
  });

  it("has no custom choice before anything is imported", () => {
    renderPanel();
    expect(screen.getAllByRole("radio", { name: /.+/ }).filter((r) => (r as HTMLInputElement).value === "custom")).toHaveLength(0);
  });
});
