import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PALETTES } from "../lib/palettes";
import { SettingsPanel } from "./SettingsPanel";

function renderPanel(overrides: Partial<Parameters<typeof SettingsPanel>[0]> = {}) {
  const props = {
    palette: "vanilla-milkshake" as const,
    onPaletteChange: vi.fn(),
    theme: "dark" as const,
    themeSource: "system" as const,
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
});
