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
