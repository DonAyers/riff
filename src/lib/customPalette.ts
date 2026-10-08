/**
 * Custom palettes: any list of colours (usually a Lospec palette) mapped onto Riff's semantic
 * colour tokens. The user assigns palette colours to a few roles (background, text, accent…),
 * an auto-mapper picks a starting assignment, and every token is derived from the roles with
 * contrast checks so text stays readable whatever colours come in.
 */

export const CUSTOM_PALETTE_ID = "custom";
export const CUSTOM_PALETTE_STORAGE_KEY = "riff:custom-palette";
export const CUSTOM_PALETTE_STYLE_ID = "riff-custom-palette";
export const MAX_CUSTOM_COLORS = 256;

export const PALETTE_ROLES = [
  { id: "light", label: "Light", hint: "Light background" },
  { id: "dark", label: "Dark", hint: "Dark background" },
  { id: "muted", label: "Muted", hint: "Panels and borders" },
  { id: "accent", label: "Accent", hint: "Record and main buttons" },
  { id: "highlight", label: "Highlight", hint: "Selected items" },
  { id: "warm", label: "Warm", hint: "Chord tint" },
  { id: "pink", label: "Pink", hint: "Chord tint" },
  { id: "cool", label: "Cool", hint: "Chord tint" },
  { id: "green", label: "Green", hint: "Chord tint" },
] as const;

export type PaletteRole = (typeof PALETTE_ROLES)[number]["id"];
export type RoleMap = Record<PaletteRole, string>;

export interface CustomPalette {
  name: string;
  author?: string;
  sourceUrl?: string;
  colors: string[];
  roles: RoleMap;
}

/** What is saved: the palette plus its generated CSS, so the boot script can paint it first. */
export interface StoredCustomPalette extends CustomPalette {
  css: string;
  themeColor: { light: string; dark: string };
}

/** Every semantic colour token, in the order palettes.css declares them. */
export const COLOR_TOKENS = [
  "--bg",
  "--body-bg",
  "--surface",
  "--surface-strong",
  "--surface-soft",
  "--surface-border",
  "--surface-border-strong",
  "--fg",
  "--fg-muted",
  "--accent",
  "--accent-text",
  "--accent-dim",
  "--on-accent",
  "--selected",
  "--on-selected",
  "--record",
  "--on-record",
  "--danger",
  "--success",
  "--ember",
  "--magnetic",
  "--violet",
  "--focus-ring",
  "--tint-1",
  "--tint-2",
  "--tint-3",
  "--tint-4",
  "--scrim",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type TokenSet = Record<ColorToken, string>;

// ── Colour maths (sRGB, matching CSS color-mix(in srgb, …)) ──

type Rgb = [number, number, number];

const HEX_PATTERN = /^#[0-9a-f]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_PATTERN.test(value);
}

/** Normalises "#abc", "abc", "#AABBCC" or "aabbcc" to "#aabbcc"; returns null otherwise. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(raw)) return `#${raw.replace(/./g, (c) => c + c)}`;
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  return null;
}

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** Mixes `amount` (0–1) of `b` into `a`. */
export function mix(a: string, b: string, amount: number): string {
  const ca = toRgb(a);
  const cb = toRgb(b);
  return toHex(ca.map((c, i) => c + (cb[i] - c) * amount) as Rgb);
}

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Hue (0–360), chroma (0–1) and HSL lightness (0–1). */
function describe(hex: string): { hue: number; chroma: number; lightness: number } {
  const [r, g, b] = toRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  let hue = 0;
  if (chroma > 0) {
    if (max === r) hue = ((g - b) / chroma) % 6;
    else if (max === g) hue = (b - r) / chroma + 2;
    else hue = (r - g) / chroma + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { hue, chroma, lightness: (max + min) / 2 };
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Moves `color` toward `target` in small steps until it reaches `ratio` against every colour in
 * `against`. Returns `target` if nothing short of it is enough.
 */
export function ensureContrast(color: string, target: string, against: readonly string[], ratio: number): string {
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(color, target, step / 20);
    if (against.every((other) => contrast(candidate, other) >= ratio)) return candidate;
  }
  return target;
}

/** Picks whichever of the candidates reads best on `background`, pushed to black or white if needed. */
function readableOn(background: string, candidates: readonly string[]): string {
  const best = [...candidates].sort((a, b) => contrast(b, background) - contrast(a, background))[0];
  if (contrast(best, background) >= 4.5) return best;
  const extreme = luminance(background) > 0.18 ? "#000000" : "#ffffff";
  return ensureContrast(best, extreme, [background], 4.5);
}

// ── Parsing ──

/**
 * Pulls colours out of pasted text: hex codes in any common form (a Lospec .hex file, a CSS
 * list, "#abc"), or GIMP .gpl rows of "R G B name". Duplicates are dropped, order is kept.
 */
export function parseColorList(text: string): string[] {
  const colors: string[] = [];
  const add = (hex: string | null) => {
    if (hex && !colors.includes(hex) && colors.length < MAX_CUSTOM_COLORS) colors.push(hex);
  };

  if (/^\s*GIMP Palette/i.test(text)) {
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(\s|$)/);
      if (match) add(toHex([Number(match[1]), Number(match[2]), Number(match[3])]));
    }
    return colors;
  }

  // Three-digit codes need their "#", so ordinary words like "add" or "bed" aren't read as colours.
  for (const match of text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b|\b([0-9a-f]{6})\b/gi)) {
    add(normalizeHex(match[1] ?? match[2]));
  }
  return colors;
}

/** Accepts a Lospec palette link (with or without .json/.hex) or a bare slug. */
export function parseLospecSlug(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const fromUrl = trimmed.match(/lospec\.com\/palette-list\/([a-z0-9-]+)/);
  const slug = fromUrl ? fromUrl[1] : trimmed;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

export function lospecPaletteUrl(slug: string): string {
  return `https://lospec.com/palette-list/${slug}`;
}

export interface LospecPalette {
  name: string;
  author?: string;
  sourceUrl: string;
  colors: string[];
}

/** Loads a palette from Lospec's public JSON endpoint (https://lospec.com/palette-list/<slug>.json). */
export async function fetchLospecPalette(slug: string, fetchImpl: typeof fetch = fetch): Promise<LospecPalette> {
  const response = await fetchImpl(`${lospecPaletteUrl(slug)}.json`);
  if (!response.ok) throw new Error(`Lospec returned ${response.status}`);
  const data = (await response.json()) as { name?: unknown; author?: unknown; colors?: unknown };
  const colors = Array.isArray(data.colors)
    ? parseColorList(data.colors.filter((c): c is string => typeof c === "string").join(" "))
    : [];
  if (colors.length < 2) throw new Error("That palette has fewer than two colours.");
  return {
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : slug,
    author: typeof data.author === "string" && data.author.trim() ? data.author.trim() : undefined,
    sourceUrl: lospecPaletteUrl(slug),
    colors,
  };
}

// ── Auto-mapping ──

const HUE_TARGETS: Record<"warm" | "pink" | "cool" | "green", number> = {
  warm: 35,
  pink: 325,
  cool: 205,
  green: 120,
};

/**
 * Picks a starting role for each palette colour:
 * the lightest and darkest colours become Light and Dark, the most vivid warm-leaning colour
 * becomes Accent (record buttons read as red/orange), the greyest becomes Muted, a vivid colour
 * far from the accent becomes Highlight, and the tints take the colours nearest their hues.
 * Roles may share a colour when the palette is small.
 */
export function autoMapRoles(colors: readonly string[]): RoleMap {
  if (colors.length === 0) throw new Error("A palette needs at least one colour.");
  const byLuminance = [...colors].sort((a, b) => luminance(a) - luminance(b));
  const dark = byLuminance[0];
  const light = byLuminance[byLuminance.length - 1];
  const middle = colors.filter((c) => c !== light && c !== dark);
  const pool = middle.length > 0 ? middle : [light, dark];

  const pick = (candidates: readonly string[], score: (c: string) => number) =>
    [...candidates].sort((a, b) => score(b) - score(a))[0];

  const accent = pick(pool, (c) => {
    const { hue, chroma, lightness } = describe(c);
    const warm = hue >= 330 || hue <= 45 ? 0.2 : 0;
    return chroma + warm - Math.abs(lightness - 0.55) * 0.6;
  });
  const rest = pool.filter((c) => c !== accent);
  const others = rest.length > 0 ? rest : pool;
  const muted = pick(others, (c) => -describe(c).chroma - Math.abs(luminance(c) - 0.2));
  const accentHue = describe(accent).hue;
  const highlight = pick(others.filter((c) => c !== muted).length > 0 ? others.filter((c) => c !== muted) : others, (c) => {
    const { hue, chroma, lightness } = describe(c);
    return chroma + (hueDistance(hue, accentHue) / 180) * 0.5 + lightness * 0.3;
  });

  const vivid = colors.filter((c) => c !== light && c !== dark && describe(c).chroma > 0.08);
  const tintPool = vivid.length > 0 ? vivid : pool;
  const nearestHue = (target: number) =>
    pick(tintPool, (c) => -hueDistance(describe(c).hue, target) + describe(c).chroma * 20);

  return {
    light,
    dark,
    muted,
    accent,
    highlight,
    warm: nearestHue(HUE_TARGETS.warm),
    pink: nearestHue(HUE_TARGETS.pink),
    cool: nearestHue(HUE_TARGETS.cool),
    green: nearestHue(HUE_TARGETS.green),
  };
}

// ── Token derivation ──

const alpha = (hex: string, opacity: number) =>
  `${hex}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;

/** Light and Dark pushed apart until body text clears 7:1 (WCAG AAA) both ways. */
function separate(light: string, dark: string): { light: string; dark: string } {
  let l = luminance(light) >= luminance(dark) ? light : dark;
  let d = l === light ? dark : light;
  for (let step = 0; step < 20 && contrast(l, d) < 7; step += 1) {
    l = mix(l, "#ffffff", 0.12);
    d = mix(d, "#000000", 0.12);
  }
  return { light: l, dark: d };
}

function deriveMode(roles: RoleMap, mode: "light" | "dark"): TokenSet {
  const { light, dark } = separate(roles.light, roles.dark);
  const bg = mode === "light" ? light : dark;
  const fg = mode === "light" ? dark : light;
  const weights = mode === "light" ? [0.14, 0.24, 0.07, 0.4] : [0.3, 0.48, 0.16, 0.62];
  // Panels are the background tinted with Muted, but never so far that body text drops below 7:1.
  const tinted = (weight: number) => {
    for (let w = weight; w > 0; w -= 0.02) {
      const candidate = mix(bg, roles.muted, w);
      if (contrast(candidate, fg) >= 7) return candidate;
    }
    return bg;
  };
  const surface = tinted(weights[0]);
  const surfaceStrong = tinted(weights[1]);
  const surfaceSoft = tinted(weights[2]);
  const surfaces = [bg, surface, surfaceStrong];
  const textOn = (color: string) => ensureContrast(color, fg, surfaces, 4.5);
  const selected = mode === "light" ? roles.highlight : mix(roles.highlight, dark, 0.2);
  const tint = (color: string) =>
    ensureContrast(mix(color, bg, mode === "light" ? 0.35 : 0.6), bg, [fg], 4.5);

  return {
    "--bg": bg,
    "--body-bg": bg,
    "--surface": surface,
    "--surface-strong": surfaceStrong,
    "--surface-soft": surfaceSoft,
    "--surface-border": mix(bg, roles.muted, weights[3]),
    "--surface-border-strong": ensureContrast(roles.muted, fg, [bg], 3),
    "--fg": fg,
    "--fg-muted": textOn(roles.muted),
    "--accent": roles.accent,
    "--accent-text": textOn(roles.accent),
    "--accent-dim": alpha(roles.accent, mode === "light" ? 0.22 : 0.26),
    "--on-accent": readableOn(roles.accent, [light, dark]),
    "--selected": selected,
    "--on-selected": readableOn(selected, [light, dark]),
    "--record": roles.accent,
    "--on-record": readableOn(roles.accent, [light, dark]),
    "--danger": textOn(roles.accent),
    "--success": textOn(roles.green),
    "--ember": textOn(roles.warm),
    "--magnetic": textOn(roles.cool),
    "--violet": textOn(roles.pink),
    "--focus-ring": fg,
    "--tint-1": tint(roles.warm),
    "--tint-2": tint(roles.pink),
    "--tint-3": tint(roles.cool),
    "--tint-4": tint(roles.green),
    "--scrim": alpha(dark, mode === "light" ? 0.5 : 0.7),
  };
}

export function deriveTokens(roles: RoleMap): { light: TokenSet; dark: TokenSet } {
  return { light: deriveMode(roles, "light"), dark: deriveMode(roles, "dark") };
}

export function buildCustomPaletteCss(roles: RoleMap): string {
  const { light, dark } = deriveTokens(roles);
  const block = (tokens: TokenSet) => COLOR_TOKENS.map((token) => `  ${token}: ${tokens[token]};`).join("\n");
  return [
    `:root[data-palette="${CUSTOM_PALETTE_ID}"] {\n${block(light)}\n}`,
    `:root[data-palette="${CUSTOM_PALETTE_ID}"][data-theme="dark"] {\n${block(dark)}\n}`,
  ].join("\n");
}

export function toStoredPalette(palette: CustomPalette): StoredCustomPalette {
  const { light, dark } = deriveTokens(palette.roles);
  return {
    ...palette,
    css: buildCustomPaletteCss(palette.roles),
    themeColor: { light: light["--bg"], dark: dark["--bg"] },
  };
}

/** Validates saved data; anything malformed reads as no custom palette. */
export function parseStoredPalette(raw: string | null): CustomPalette | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<CustomPalette>;
    const colors = Array.isArray(data.colors) ? data.colors.filter(isHexColor).slice(0, MAX_CUSTOM_COLORS) : [];
    if (colors.length < 2 || typeof data.name !== "string" || !data.roles) return null;
    const roles = {} as RoleMap;
    for (const { id } of PALETTE_ROLES) {
      const value = (data.roles as Partial<RoleMap>)[id];
      if (!isHexColor(value)) return null;
      roles[id] = value;
    }
    return {
      name: data.name.slice(0, 80),
      author: typeof data.author === "string" ? data.author.slice(0, 80) : undefined,
      sourceUrl:
        typeof data.sourceUrl === "string" && data.sourceUrl.startsWith("https://lospec.com/")
          ? data.sourceUrl
          : undefined,
      colors,
      roles,
    };
  } catch {
    return null;
  }
}
