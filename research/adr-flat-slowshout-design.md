# ADR: Flat Slowshout16 look with pixel fonts

Date: 2026-10-06
Status: Accepted

## Context

After the tuner and looper work (PR #7) the UI mixed glows, gradients, cards inside cards and a different header on every tab. The custom fonts named in `tokens.css` (Bricolage Grotesque, Fraunces) were never loaded, so every device fell back to Georgia and Trebuchet. Don reviewed three rounds of mockups and picked:

- the [Slowshout16](https://lospec.com/palette-list/slowshout16) palette by Phenomenician,
- Silkscreen (headings) + VT323 (numbers) + Atkinson Hyperlegible (body),
- a fully flat style: no box-shadows, glows, gradients or blur.

He rejected soft serif and handwritten display fonts as looking AI-generated.

## Decision

- `src/styles/tokens.css` holds the 16 palette colours as `--ss-*` and maps them to semantic tokens for light (default) and `[data-theme="dark"]`. Components use only semantic tokens (`--surface`, `--accent`, `--accent-text`, `--selected`, `--record`, `--tint-1..4`, …), never literals or `--ss-*`.
- Fonts are self-hosted with `@fontsource` (Latin subsets only) in `src/styles/fonts.ts`, and `woff2` is in the Workbox precache so the PWA renders offline.
- Silkscreen is only for short headings, the wordmark, chord names and the tuner note. VT323 is only for numeric readouts, sized about 1.3x. Body copy stays in Atkinson Hyperlegible for legibility.
- Every tab renders the same `AppHeader` (wordmark, theme toggle, optional help).
- Flat is enforced by `tests/e2e/visual-style.spec.ts`, which fails on any visible box-shadow, text-shadow, radial/conic gradient or backdrop-filter in either theme. Linear gradients are allowed only for functional marks (piano-roll grid lines).

## Consequences

- Rust (`--accent`) on paper is below 4.5:1 for small text, so accent-coloured text uses `--accent-text` (brick in light, rose in dark).
- `color-mix()` is used for tints; it needs Safari 16.2+ / Chrome 111+.
- Mockups for the rejected directions live in the project thread as published artifacts.
