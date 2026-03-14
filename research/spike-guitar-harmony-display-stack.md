# Spike: Guitar Harmony Display Stack

> Date: 2026-03-13  
> Status: Research - recommendation ready  
> Scope: Choose the right display strategy for key relationships, chord voicings, and theory-guided chord exploration.

---

## Goal

Support the guitar workflow with three linked interactions:

1. show detected key clearly
2. let the user click the key to explore related harmony
3. let the user click a chord to see a playable voicing and useful ways to extend or substitute it

---

## What This Workflow Needs

- compact chord diagrams that look good on mobile and desktop
- a key relationship view that is easy to understand quickly
- a chord detail surface that can show voicings and grouped theory suggestions
- a clean boundary between chord data, rendering, and theory logic

---

## Chord Diagram Recommendation

### Keep `svguitar` for now

The repo already uses `svguitar` successfully for chord diagrams.

Reasons to keep it now:

- it already solves the core rendering problem
- it supports barres, fingering, and compact diagrams
- replacing it would not solve the more important product problems first

The bigger gap is not the renderer. The bigger gaps are:

- voicing ranking
- richer chord data
- better chord-detail interaction design

### When to revisit the renderer

Only revisit if we decide the product needs a full interactive fretboard explorer rather than compact chord diagrams.

If that happens, `react-guitar` becomes worth evaluating more seriously.

---

## Key Relationship View Recommendation

### Build this as a custom React/SVG component

Do not look for a "key theory library" first. This should be a product-specific visualization.

What it should show in v1:

- current key
- relative major/minor
- neighboring keys / close relationships
- scale degree labels for the current harmonic context

Why custom is best:

- the content is limited and product-specific
- we control the copy and interaction model
- this avoids forcing music-theory UI into a generic visualization library

---

## Chord Detail Recommendation

### Structure the chord detail around user intent

When a user clicks a chord, show:

1. most likely playable voicing
2. alternate voicings
3. grouped "spice it up" suggestions

Suggestion groups should be organized by intent:

- `color` - add warmth or brightness
- `tension` - add bite or suspense
- `substitution` - swap function while keeping the phrase useful
- `movement` - choose a chord that leads somewhere musically

This is better than showing a flat unranked list of theory terms.

---

## Data Strategy Recommendation

### Keep `lookupVoicings()` as the app boundary

Do not spread renderer-specific or dataset-specific chord shapes throughout the app.

Keep one boundary:

- input: detected chord symbol
- output: app-owned voicing objects

Then improve behind that boundary:

- better ranking for common guitar shapes first
- curated additions from a richer dataset if needed
- context-aware ranking later

---

## Open Research Questions

1. Do we need a richer backing dataset than the current seeded/generated shapes?
2. How should voicings be ranked for beginners versus experienced players?
3. Should the key relationship view use a circle-of-fifths metaphor, a relationship map, or a simpler card layout?
4. Which chord suggestion groups are most useful in practice for guitar players using this app?

---

## Decision

- Keep `svguitar` now.
- Build the key relationship chart as a custom component.
- Invest next in chord-detail UX, voicing ranking, and better theory grouping before considering a renderer swap.
