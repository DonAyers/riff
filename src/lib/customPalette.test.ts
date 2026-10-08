import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  COLOR_TOKENS,
  PALETTE_ROLES,
  autoMapRoles,
  buildCustomPaletteCss,
  contrast,
  deriveTokens,
  fetchLospecPalette,
  parseColorList,
  parseLospecSlug,
  parseStoredPalette,
  toStoredPalette,
  type TokenSet,
} from "./customPalette";

const PICO_8 = "000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa";
const SWEETIE_16 = "1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57";

const SAMPLES: Record<string, string[]> = {
  "PICO-8": parseColorList(PICO_8),
  "Sweetie 16": parseColorList(SWEETIE_16),
  "Game Boy (4 greens)": parseColorList("0f380f 306230 8bac0f 9bbc0f"),
  "1-bit": ["#000000", "#ffffff"],
  "Two close greys": ["#7a7a7a", "#8a8a8a"],
  "All pastel": parseColorList("#ffd1dc #c1e1c1 #fdfd96 #aec6cf #cfcfc4"),
};

function expectReadable(tokens: TokenSet, label: string) {
  const surfaces = [tokens["--bg"], tokens["--surface"], tokens["--surface-strong"]];
  expect(contrast(tokens["--fg"], tokens["--bg"]), `${label} body text`).toBeGreaterThanOrEqual(7);
  for (const token of ["--fg-muted", "--accent-text", "--danger", "--success", "--ember", "--magnetic", "--violet"] as const) {
    for (const surface of surfaces) {
      expect(contrast(tokens[token], surface), `${label} ${token}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(contrast(tokens["--on-accent"], tokens["--accent"]), `${label} button label`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens["--on-record"], tokens["--record"]), `${label} record icon`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens["--on-selected"], tokens["--selected"]), `${label} selected`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(tokens["--surface-border-strong"], tokens["--bg"]), `${label} strong border`).toBeGreaterThanOrEqual(3);
  for (const tint of ["--tint-1", "--tint-2", "--tint-3", "--tint-4"] as const) {
    expect(contrast(tokens["--fg"], tokens[tint]), `${label} text on ${tint}`).toBeGreaterThanOrEqual(4.5);
  }
}

describe("parseColorList", () => {
  it("reads a Lospec .hex file, CSS hex codes and short codes", () => {
    expect(parseColorList("ff004d\r\n29adff\n")).toEqual(["#ff004d", "#29adff"]);
    expect(parseColorList("#FF004D, #abc; #29adff")).toEqual(["#ff004d", "#aabbcc", "#29adff"]);
  });

  it("drops duplicates and ignores ordinary words", () => {
    expect(parseColorList("#ffffff #FFFFFF add a bed #000")).toEqual(["#ffffff", "#000000"]);
  });

  it("reads a GIMP .gpl palette", () => {
    const gpl = "GIMP Palette\nName: Test\n#\n255   0  77\tred\n 41 173 255 blue\n";
    expect(parseColorList(gpl)).toEqual(["#ff004d", "#29adff"]);
  });
});

describe("parseLospecSlug", () => {
  it("accepts links, .json links and bare names", () => {
    expect(parseLospecSlug("https://lospec.com/palette-list/sweetie-16")).toBe("sweetie-16");
    expect(parseLospecSlug("lospec.com/palette-list/pico-8.json")).toBe("pico-8");
    expect(parseLospecSlug("  Slowshout16 ")).toBe("slowshout16");
  });

  it("rejects anything that isn't a palette name", () => {
    expect(parseLospecSlug("not a palette")).toBeNull();
    expect(parseLospecSlug("../../etc")).toBeNull();
  });
});

describe("fetchLospecPalette", () => {
  it("loads name, author and colours from Lospec's JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ name: "Sweetie 16", author: "GrafxKid", colors: ["1a1c2c", "f4f4f4", "b13e53"] }))
    );

    const palette = await fetchLospecPalette("sweetie-16", fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledWith("https://lospec.com/palette-list/sweetie-16.json");
    expect(palette).toEqual({
      name: "Sweetie 16",
      author: "GrafxKid",
      sourceUrl: "https://lospec.com/palette-list/sweetie-16",
      colors: ["#1a1c2c", "#f4f4f4", "#b13e53"],
    });
  });

  it("fails on a missing palette or one with too few colours", async () => {
    const notFound = vi.fn(async () => new Response("", { status: 404 }));
    await expect(fetchLospecPalette("nope", notFound as unknown as typeof fetch)).rejects.toThrow();

    const tiny = vi.fn(async () => new Response(JSON.stringify({ name: "x", colors: ["ffffff"] })));
    await expect(fetchLospecPalette("x", tiny as unknown as typeof fetch)).rejects.toThrow();
  });
});

describe("autoMapRoles", () => {
  it("uses the lightest and darkest colours for the backgrounds", () => {
    const roles = autoMapRoles(SAMPLES["PICO-8"]);
    expect(roles.light).toBe("#fff1e8");
    expect(roles.dark).toBe("#000000");
  });

  it("picks a vivid warm colour as the accent", () => {
    expect(autoMapRoles(SAMPLES["PICO-8"]).accent).toBe("#ff004d");
    expect(["#b13e53", "#ef7d57"]).toContain(autoMapRoles(SAMPLES["Sweetie 16"]).accent);
  });

  it("matches tints to their hues when the palette has them", () => {
    const roles = autoMapRoles(SAMPLES["PICO-8"]);
    expect(roles.cool).toBe("#29adff");
    expect(roles.green).toBe("#00e436");
  });

  it("only uses colours from the palette, and fills every role even for two colours", () => {
    for (const colors of Object.values(SAMPLES)) {
      const roles = autoMapRoles(colors);
      for (const { id } of PALETTE_ROLES) expect(colors).toContain(roles[id]);
    }
  });
});

describe("deriveTokens", () => {
  it.each(Object.entries(SAMPLES))("keeps %s readable in light and dark", (name, colors) => {
    const tokens = deriveTokens(autoMapRoles(colors));
    expectReadable(tokens.light, `${name} light`);
    expectReadable(tokens.dark, `${name} dark`);
  });

  it("stays readable whatever the user maps where", () => {
    const colors = SAMPLES["Sweetie 16"];
    // Deliberately bad: every role on the same mid colour, and light/dark swapped.
    const roles = Object.fromEntries(PALETTE_ROLES.map(({ id }) => [id, "#3b5dc9"])) as ReturnType<typeof autoMapRoles>;
    expectReadable(deriveTokens({ ...roles, light: colors[0], dark: colors[12] }).light, "swapped light");
    expectReadable(deriveTokens(roles).dark, "single colour dark");
  });

  it("defines exactly the tokens palettes.css defines", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/palettes.css"), "utf8");
    const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    const cssTokens = Array.from(rootBlock.matchAll(/(--[\w-]+):/g), (m) => m[1]).sort();
    expect([...COLOR_TOKENS].sort()).toEqual(cssTokens);
    expect(Object.keys(deriveTokens(autoMapRoles(SAMPLES["PICO-8"])).light).sort()).toEqual(cssTokens);
  });

  it("writes CSS scoped to the custom palette in both modes", () => {
    const css = buildCustomPaletteCss(autoMapRoles(SAMPLES["PICO-8"]));
    expect(css).toContain(':root[data-palette="custom"] {');
    expect(css).toContain(':root[data-palette="custom"][data-theme="dark"] {');
    expect(css.match(/--bg:/g)).toHaveLength(2);
  });
});

describe("parseStoredPalette", () => {
  const colors = SAMPLES["PICO-8"];
  const stored = toStoredPalette({ name: "PICO-8", colors, roles: autoMapRoles(colors) });

  it("round-trips a saved palette", () => {
    expect(parseStoredPalette(JSON.stringify(stored))).toMatchObject({ name: "PICO-8", colors });
  });

  it("rejects junk, missing roles and non-colour values", () => {
    expect(parseStoredPalette(null)).toBeNull();
    expect(parseStoredPalette("{not json")).toBeNull();
    expect(parseStoredPalette(JSON.stringify({ ...stored, roles: { ...stored.roles, accent: "red" } }))).toBeNull();
    expect(parseStoredPalette(JSON.stringify({ ...stored, colors: ["#fff"] }))).toBeNull();
  });

  it("drops source links that aren't Lospec", () => {
    const parsed = parseStoredPalette(JSON.stringify({ ...stored, sourceUrl: "javascript:alert(1)" }));
    expect(parsed?.sourceUrl).toBeUndefined();
  });
});
