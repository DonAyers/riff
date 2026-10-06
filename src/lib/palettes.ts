/**
 * Colour palettes the user can pick in Settings. Each one is a Lospec palette mapped onto
 * Riff's semantic tokens in src/styles/palettes.css (light and dark). Keep the two files in
 * step: an id here must have matching `[data-palette="<id>"]` blocks there, except the
 * default, which lives on bare :root.
 */
export interface Palette {
  id: string;
  name: string;
  author: string;
  /** Lospec page the colours come from. */
  sourceUrl: string;
  /** Browser/OS chrome colour per mode; matches each mode's --bg. */
  themeColor: { light: string; dark: string };
  /** A few representative colours for the picker preview (background first). */
  swatches: readonly string[];
}

export const PALETTES = [
  {
    id: "vanilla-milkshake",
    name: "Vanilla Milkshake",
    author: "Space Sandwich",
    sourceUrl: "https://lospec.com/palette-list/vanilla-milkshake",
    themeColor: { light: "#fff7e4", dark: "#28282e" },
    swatches: ["#fff7e4", "#f98284", "#b3e3da", "#ffc384", "#28282e"],
  },
  {
    id: "slowshout",
    name: "Slowshout16",
    author: "Phenomenician",
    sourceUrl: "https://lospec.com/palette-list/slowshout16",
    themeColor: { light: "#eedebe", dark: "#23222f" },
    swatches: ["#eedebe", "#a75141", "#6a7d5f", "#cf982e", "#23222f"],
  },
  {
    id: "chasm",
    name: "Chasm",
    author: "dysphoriaa",
    sourceUrl: "https://lospec.com/palette-list/chasm",
    themeColor: { light: "#fcf5e6", dark: "#32313b" },
    swatches: ["#32313b", "#ff5dcc", "#8dd894", "#85daeb", "#f5daa7"],
  },
  {
    id: "paper-8",
    name: "Paper 8",
    author: "Frosty Rabbid",
    sourceUrl: "https://lospec.com/palette-list/paper-8",
    themeColor: { light: "#fbf5d5", dark: "#1f244b" },
    swatches: ["#f6e79c", "#a8605d", "#b6cf8e", "#d1a67e", "#1f244b"],
  },
  {
    id: "fairydust-8",
    name: "Fairydust 8",
    author: "Yousurname",
    sourceUrl: "https://lospec.com/palette-list/fairydust-8",
    themeColor: { light: "#f0f6e8", dark: "#3d2f4e" },
    swatches: ["#f0f6e8", "#c45d9f", "#93d4b5", "#e39aac", "#634b7d"],
  },
  {
    id: "cl8uds",
    name: "CL8UDS",
    author: "_Nicola",
    sourceUrl: "https://lospec.com/palette-list/cl8uds",
    themeColor: { light: "#edf1f6", dark: "#303442" },
    swatches: ["#a5b7d4", "#ef9d7f", "#fcb08c", "#b48d92", "#8fa0bf"],
  },
] as const satisfies readonly Palette[];

export type PaletteId = (typeof PALETTES)[number]["id"];

export const PALETTE_IDS: readonly PaletteId[] = PALETTES.map((palette) => palette.id);

export const DEFAULT_PALETTE_ID: PaletteId = "vanilla-milkshake";

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((palette) => palette.id === value);
}

export function getPalette(id: PaletteId): Palette {
  return PALETTES.find((palette) => palette.id === id) ?? PALETTES[0];
}
