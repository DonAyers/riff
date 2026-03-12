# Spike: Guitar Chord Display Libraries for Clickable Detected Chords

**Date:** 2026-03-12  
**Status:** Recommendation ready

---

## Goal

Find the best open-source JavaScript library strategy for this codebase so a user can click any detected chord and immediately see a guitar-oriented chord diagram or fretboard, without reinventing the rendering layer.

This spike is intentionally practical for **Riff**, not a generic library roundup.

---

## Current repo fit

Riff is already close to this feature:

- `src/App.tsx` already renders:
  - `ChordDisplay` for the current detected chord
  - `ChordTimeline` for detected chord events in Song Lane
  - `ChordFretboard` for the active voicing in Chord Lane
- `src/lib/chordVoicings.ts` already exposes `lookupVoicings(chordName)` and a `GuitarVoicing` shape:
  - `frets`
  - `fingers`
  - `barres`
  - `baseFret`
- `src/lib/chordVoicingsGenerator.ts` already synthesizes extra guitar-friendly shapes from E and A barre patterns
- Stack fit is strong for modern packages:
  - React 19
  - TypeScript 5.9
  - Vite 7
  - Tonal already in use

### What this means

The main missing piece is **not** chord detection. It is a better, reusable **guitar rendering layer** plus a more scalable **voicing data source**.

Also, the natural click targets already exist:

1. **`ChordDisplay`** in Song Lane and Chord Lane
2. **`ChordTimeline`** events in Song Lane

So the clean product direction is:

> click detected chord label or timeline event → open a guitar chord view → show one or more playable voicings

---

## Evaluation criteria

I compared options on:

- performance / runtime weight
- customization
- popularity / adoption
- maintenance recency
- license
- React / TypeScript friendliness
- guitar-specific support
- renderer vs data-source fit

---

## Best candidates

### 1. `svguitar` — best rendering-library fit

- **Type:** rendering library
- **License:** MIT
- **Repo:** `omnibrain/svguitar`
- **Signals:**
  - TypeScript library
  - ~795 GitHub stars
  - recently updated
  - documented API
- **Why it stands out:**
  - built specifically for **SVG guitar chord charts**
  - very customizable: orientation, strings, frets, labels, colors, barres, finger text, markers, accessibility title
  - easy to feed with existing Riff data after a small adapter
  - React-friendly even though it is not React-specific

### 2. `react-guitar` — best full-fretboard React option

- **Type:** interactive React fretboard component
- **License:** MIT
- **Repo:** `4lejandrito/react-guitar`
- **Signals:**
  - TypeScript package
  - ~652 GitHub stars
  - recently updated
  - supports React 19 peer dependency
- **Why it stands out:**
  - excellent if Riff wants a **whole-neck interactive view**
  - supports themes, lefty mode, centered fret ranges, custom finger rendering, hover/play hooks
  - feels more like an interactive instrument than a compact chord card

### 3. `@tombatossals/react-chords` — decent all-in-one legacy option

- **Type:** React renderer
- **License:** MIT
- **Repo:** `tombatossals/react-chords`
- **Signals:**
  - ~220 GitHub stars
  - React 19-compatible peer dependency
  - simple API
- **Why it matters:**
  - good for quick integration
  - closely related to `tombatossals/chords-db`, which is still one of the more useful open chord-position datasets
- **Why it is not the top pick:**
  - older JS-first package
  - weaker TypeScript story than `svguitar`
  - less control over output than `svguitar`

### 4. `vexchords` — capable but not a strong fit here

- **Type:** renderer
- **License:** MIT
- **Repo:** `0xfe/vexchords`
- **Signals:**
  - ~919 GitHub stars
  - long-lived project
  - still updated
- **Why it is not the top pick:**
  - older API style
  - not React-native
  - weaker TypeScript ergonomics
  - less compelling than `svguitar` for a focused modern chord-diagram use case

---

## Data-source candidates

### `tombatossals/chords-db` — best practical voicing dataset

- **Type:** data source only
- **License:** MIT
- **Signals:**
  - ~516 GitHub stars
  - established schema for string-instrument chord positions
  - directly models frets, fingers, barres, capo
- **Best use in Riff:**
  - not as a runtime dependency
  - **vendor or precompile selected data into app-owned JSON/TS**
  - use as a richer backing store behind `lookupVoicings()`

This is the most practical way to expand beyond the small seeded voicing dictionary already in `src/lib/chordVoicings.ts`.

### UCI Guitar Chords finger positions dataset

- **Type:** data source only
- **License:** verify before shipping
- **Signals:**
  - 2,633 chord rows
  - useful as research data
- **Why it is secondary:**
  - weaker product-readiness than `chords-db`
  - less convenient schema for direct UI use
  - licensing needs extra diligence

---

## Comparison table

| Option | Best as | Performance / weight | Customization | Popularity / health | TS / React fit | Guitar-specific support | Recommendation |
|---|---|---|---|---|---|---|---|
| `svguitar` | Renderer | Strong. Focused SVG output; lighter mental/runtime model than a full interactive fretboard | Excellent | Strong, active, popular enough | Excellent TS; easy React wrapper | Excellent for chord charts and voicings | **Best overall** |
| `react-guitar` | Interactive fretboard | Good, but heavier than a pure chord-chart renderer | Excellent | Strong, active | Excellent React + TS | Excellent for full-neck guitar UI | **Best #2 if interactivity is the priority** |
| `react-chords` | Renderer | Good and simple | Moderate | Moderate | Acceptable React fit, weaker TS story | Good for standard chord diagrams | Reasonable fallback, not first choice |
| `vexchords` | Renderer | Good | Moderate | Long-lived | Fair, older ergonomics | Good | Not the best modern fit |
| `chords-db` | Data source | Very good if compiled offline | N/A | Still useful | Easy to adapt | Strong voicing coverage | **Best data source** |
| UCI dataset | Data source | Good | N/A | Static dataset | Requires more adaptation | Good raw coverage | Research-only backup |

---

## Recommendation

## Primary recommendation: `svguitar` + Riff-owned voicing adapter

If I were implementing this in this repo, I would choose:

1. **`svguitar` for rendering**
2. **keep `lookupVoicings()` as the app boundary**
3. **expand data behind that boundary later**, likely using curated or vendored `chords-db` material

### Why this is the best fit

#### 1. It matches the product interaction

The requested feature is:

> click a detected chord and show a guitar diagram quickly

That is a **diagram-rendering** problem first, not a full interactive fretboard problem. `svguitar` is purpose-built for exactly that.

#### 2. It fits the current architecture

Riff already has:

- chord labels
- chord timeline events
- chord voicing lookup
- a guitar-specific lane

So `svguitar` can slot in without changing the analysis pipeline.

#### 3. It reduces custom rendering code without forcing a data rewrite on day one

Today `ChordFretboard.tsx` hand-renders SVG. It works, but every future enhancement is on the app team:

- alternate styles
- better spacing
- tuning labels
- export-quality diagrams
- accessibility polish
- visual variants for hero cards, modal cards, timeline popovers

`svguitar` offloads most of that surface area while letting Riff keep control of chord identity and voicing selection.

#### 4. It is the strongest TypeScript/customization balance

Compared with the alternatives:

- more configurable than `react-chords`
- cleaner fit for compact diagrams than `react-guitar`
- more modern and TS-friendly for this use case than `vexchords`

---

## Secondary recommendation: `react-guitar` only if the product shifts to an interactive neck

Choose `react-guitar` instead if the feature becomes:

- tap strings/frets directly
- animate strums or note playback on the neck
- show scale tones around the active chord
- let the user explore alternate positions across the fretboard

That would be a different product decision:

> "interactive guitar trainer"  
instead of  
> "detected chord → quick playable guitar diagram"

For the current request, `react-guitar` is probably more component than Riff needs.

---

## Practical implementation plan for this repo

### Phase 1 — clickable detected chords

Add one selected-chord state in `App.tsx`:

```ts
type SelectedChord =
  | { source: "current"; chordName: string }
  | { source: "timeline"; chordName: string; startTimeS: number; endTimeS: number };
```

Wire click handlers into:

- `ChordDisplay`
- `ChordTimeline`

Open a modal, sheet, or side panel with:

- chord name
- current voicing index
- next/previous voicing controls
- rendered guitar diagram

### Phase 2 — swap renderer behind a thin wrapper

Create something like:

- `src/components/GuitarChordDiagram.tsx`

Its only job should be:

- accept a `GuitarVoicing`
- adapt it to the renderer input shape
- render the chosen library

That keeps the rest of the app independent from the vendor API.

### Phase 3 — preserve `lookupVoicings()` as the data boundary

Do **not** scatter package-specific chord schemas through the app.

Keep this boundary:

```ts
lookupVoicings(chordName: string | null): GuitarVoicing[]
```

That makes it safe to:

- keep current seeded voicings for now
- add compiled `chords-db` data later
- apply Riff-specific ranking rules later

### Phase 4 — improve voicing ranking for guitar users

Once clickable chord diagrams ship, rank voicings by:

1. open / cowboy shapes first
2. lower fret positions next
3. barre shapes after that
4. exotic shapes last

That matters more to user value than adding a huge number of diagrams immediately.

---

## What to avoid

### Avoid making `react-chords` the long-term foundation

It is workable, but for this repo it is not the strongest long-term choice because:

- weaker TypeScript ergonomics
- less control than `svguitar`
- less clear separation between rendering and data strategy

### Avoid shipping a raw external chord dataset directly into runtime UI code

Normalize it first into Riff-owned shapes. That prevents vendor lock-in and keeps tests stable.

### Avoid replacing `lookupVoicings()` with library-specific logic

Riff already has a useful domain boundary. Keep it.

---

## Final decision

### Best option for Riff now

**Adopt `svguitar` as the rendering library, behind a small React wrapper, while keeping `lookupVoicings()` as the source-of-truth API.**

Then:

- use current generated voicings immediately
- optionally enrich with curated `chords-db` data afterward

### Best second option

**Use `react-guitar` only if the team explicitly wants a full interactive fretboard experience rather than compact detected-chord diagrams.**

---

## Sources reviewed

- Riff codebase:
  - `src/App.tsx`
  - `src/components/ChordDisplay.tsx`
  - `src/components/ChordTimeline.tsx`
  - `src/components/ChordFretboard.tsx`
  - `src/lib/chordVoicings.ts`
  - `src/lib/chordVoicingsGenerator.ts`
- `omnibrain/svguitar`
- `4lejandrito/react-guitar`
- `tombatossals/react-chords`
- `tombatossals/chords-db`
- `0xfe/vexchords`
- UCI Guitar Chords finger positions dataset
