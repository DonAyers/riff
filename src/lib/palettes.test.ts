import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PALETTE_ID, PALETTES, getPalette, isPaletteId } from "./palettes";

const css = readFileSync(resolve(__dirname, "../styles/palettes.css"), "utf8");

/** Returns the custom property names declared in the block for `selector`. */
function tokensFor(selector: string): string[] {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return [];
  const body = css.slice(start + selector.length + 2, css.indexOf("}", start));
  return Array.from(body.matchAll(/(--[\w-]+):/g), (match) => match[1]).sort();
}

describe("palettes", () => {
  const defaultTokens = tokensFor(":root");

  it("lists the default first and has unique ids", () => {
    expect(PALETTES[0].id).toBe(DEFAULT_PALETTE_ID);
    expect(new Set(PALETTES.map((palette) => palette.id)).size).toBe(PALETTES.length);
  });

  it("defines the full colour token set for the default palette in both modes", () => {
    expect(defaultTokens).toContain("--bg");
    expect(defaultTokens).toContain("--accent");
    expect(tokensFor(':root[data-theme="dark"]')).toEqual(defaultTokens);
  });

  it.each(PALETTES.filter((palette) => palette.id !== DEFAULT_PALETTE_ID))(
    "defines every token for $name in light and dark",
    ({ id }) => {
      expect(tokensFor(`:root[data-palette="${id}"]`)).toEqual(defaultTokens);
      expect(tokensFor(`:root[data-palette="${id}"][data-theme="dark"]`)).toEqual(defaultTokens);
    }
  );

  it("validates palette ids and falls back to the default", () => {
    expect(isPaletteId("chasm")).toBe(true);
    expect(isPaletteId("nope")).toBe(false);
    expect(isPaletteId(null)).toBe(false);
    expect(getPalette("chasm").name).toBe("Chasm");
  });
});
