import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { autoMapRoles, type CustomPalette } from "../lib/customPalette";
import { CustomPaletteEditor } from "./CustomPaletteEditor";

const COLORS = ["#fff1e8", "#000000", "#ff004d", "#29adff", "#00e436"];
const PALETTE: CustomPalette = { name: "Mini PICO", colors: COLORS, roles: autoMapRoles(COLORS) };

function importText(text: string) {
  fireEvent.change(screen.getByLabelText(/lospec link, palette name or hex codes/i), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Import" }));
}

describe("CustomPaletteEditor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("imports pasted hex codes with an automatic colour mapping", () => {
    const onChange = vi.fn();
    render(<CustomPaletteEditor palette={null} onChange={onChange} />);

    importText("#fff1e8 #000000 #ff004d #29adff");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Pasted palette",
        colors: ["#fff1e8", "#000000", "#ff004d", "#29adff"],
        roles: expect.objectContaining({ light: "#fff1e8", dark: "#000000", accent: "#ff004d" }),
      })
    );
  });

  it("loads a palette from a Lospec link", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ name: "Sweetie 16", author: "GrafxKid", colors: ["1a1c2c", "f4f4f4", "b13e53"] }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();
    render(<CustomPaletteEditor palette={null} onChange={onChange} />);

    importText("https://lospec.com/palette-list/sweetie-16");

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("https://lospec.com/palette-list/sweetie-16.json");
    expect(onChange.mock.calls[0][0]).toMatchObject({
      name: "Sweetie 16",
      author: "GrafxKid",
      sourceUrl: "https://lospec.com/palette-list/sweetie-16",
    });
  });

  it("explains how to paste hex codes when Lospec can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const onChange = vi.fn();
    render(<CustomPaletteEditor palette={null} onChange={onChange} />);

    importText("sweetie-16");

    expect(await screen.findByRole("alert")).toHaveTextContent(/paste the palette's hex codes/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("asks for something usable when the input is neither colours nor a palette name", () => {
    render(<CustomPaletteEditor palette={null} onChange={vi.fn()} />);

    importText("hello there");

    expect(screen.getByRole("alert")).toHaveTextContent(/lospec link or name, or at least two hex codes/i);
  });

  it("lets the user move a role to another palette colour", () => {
    const onChange = vi.fn();
    render(<CustomPaletteEditor palette={PALETTE} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /accent/i }));
    const picker = screen.getByRole("radiogroup", { name: "Colour for Accent" });
    expect(screen.getByRole("radio", { name: PALETTE.roles.accent })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "#29adff" }));

    expect(picker).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith({ ...PALETTE, roles: { ...PALETTE.roles, accent: "#29adff" } });
  });

  it("restores the automatic mapping", () => {
    const onChange = vi.fn();
    const edited = { ...PALETTE, roles: { ...PALETTE.roles, accent: "#000000" } };
    render(<CustomPaletteEditor palette={edited} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Auto-map again" }));

    expect(onChange).toHaveBeenCalledWith({ ...edited, roles: PALETTE.roles });
  });
});
