# ADR: User-selectable colour palettes

Date: 2026-10-06
Status: Accepted (extends adr-flat-slowshout-design.md)

## Context

After the flat Slowshout16 redesign shipped, Don compared five more Lospec palettes on the same layout and fonts. He wanted Vanilla Milkshake as the default, with a way for people to pick their own palette.

## Decision

- `src/styles/palettes.css` holds one block of semantic colour tokens per palette and mode. The default palette (Vanilla Milkshake) sits on bare `:root` and `:root[data-theme="dark"]`. The others use `:root[data-palette="<id>"]` and `:root[data-palette="<id>"][data-theme="dark"]`. Every block defines every token, so a palette's dark block never inherits colours from another palette's light block. `tokens.css` keeps spacing, type, radii and motion only.
- `src/lib/palettes.ts` lists the palettes (id, name, author, Lospec link, browser theme colour, preview swatches). `src/lib/palettes.test.ts` fails if a palette is missing a CSS block or a token.
- `usePalettePreference` stores the choice in `localStorage` (`riff:palette`) and sets `data-palette` on `<html>` before React renders, like the theme mode. Unknown or unreadable values fall back to the default.
- A new `/settings` page, reached from a gear button in the shared header, offers Mode (Match system, Light, Dark) and Palette. It is not a tab, so the tab bar shows no active tab there.
- Palettes: Vanilla Milkshake (default), Slowshout16, Chasm, Paper 8, Fairydust 8, CL8UDS. Slowshout16 keeps its shipped values.

## Consequences

- Body text, muted text, accent text and button labels meet WCAG AA (4.5:1) on their backgrounds in every new palette and mode. `tests/e2e/visual-style.spec.ts` checks primary buttons in all palettes and both modes. Large icon-only fills (the record button) are held to 3:1.
- Some palettes have no true dark or light colour (CL8UDS, Fairydust 8). Those use the palette's own hues mixed toward near-black or white with `color-mix()`, so they are not strictly limited to the palette's colours.
- Adding a palette means adding one entry in `palettes.ts` and two blocks in `palettes.css`.

## Addendum 2026-10-08: importing any Lospec palette

Don asked for any Lospec palette to work, with control over which colour does what.

- **Roles, not tokens.** The user maps palette colours to nine roles in Settings (Light, Dark, Muted, Accent, Highlight, Warm, Pink, Cool, Green). `src/lib/customPalette.ts` derives all 28 colour tokens for both modes from those roles. Mapping 28 tokens × 2 modes by hand would be unusable.
- **Auto-mapper.** It assigns the lightest colour to Light and the darkest to Dark. Accent goes to the most vivid colour, with warm hues preferred because record buttons read as red. Muted goes to the greyest colour. Highlight goes to a vivid colour far from the accent. The four tints go to the colours nearest their hues. Two-colour palettes work too, with roles sharing colours.
- **Contrast is enforced, not hoped for.**
  - Light and Dark are pushed apart until text reaches 7:1.
  - Panels are tinted with Muted, but only as far as keeps text at 7:1.
  - Text-like tokens move toward the text colour until they reach 4.5:1 on every surface.
  - Button labels and chord tints are checked the same way.
  - `customPalette.test.ts` runs this on PICO-8, Sweetie 16, Game Boy, 1-bit, two near-identical greys, an all-pastel palette, and a deliberately bad manual mapping.
- **Loading.** The input takes a Lospec link or name and fetches `https://lospec.com/palette-list/<slug>.json`. It also accepts pasted hex codes in any common form (Lospec's HEX download, CSS lists, `#abc`) and GIMP `.gpl` text. If Lospec can't be reached (offline, blocked or CORS), the error tells the user to paste the hex codes instead.
- **Storage and first paint.**
  - The palette is saved under `riff:custom-palette`, and `riff:palette` is set to `custom`.
  - The saved data includes the generated CSS, so the inline boot script can inject it as `<style id="riff-custom-palette">` before first paint. The app regenerates that CSS from the saved roles when it loads.
  - Malformed data falls back to the default palette.
- **Built-in palettes are unchanged.** Picking one keeps the import available to switch back to.
