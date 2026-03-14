# Spike: Staff Notation Rendering

> Date: 2026-03-13  
> Status: Research - recommendation ready  
> Scope: Choose the best rendering strategy for the melody workflow.

---

## Goal

Render detected monophonic melodies as readable staff notation in the browser, with enough quality to confirm transcription and support export.

This is for **display-first transcription**, not for building a full notation editor.

---

## What The Melody Workflow Needs

- Treble clef melody rendering
- Measure grouping
- Quarter/eighth/sixteenth note support
- Rests where useful
- Lightweight React integration
- Easy mapping from app-owned detected note events
- Room to add click-to-preview interactions later

Nice to have later:

- slurs / ties
- pickup bars
- transposition helpers
- export alignment with MusicXML if we add it later

---

## Candidates

### 1. `VexFlow`

Best fit when the app owns the note-event model and wants direct control over rendering.

Strengths:

- strong low-level engraving primitives
- good fit for building notation from detected notes
- flexible enough for interactive highlighting and playback sync
- works well when we only need melody notation, not full score import

Tradeoffs:

- more implementation work than a higher-level score renderer
- we must own measure building, rhythmic grouping, and note-to-staff mapping

### 2. `OpenSheetMusicDisplay`

Best fit when the source of truth is `MusicXML` and the product wants fuller score rendering.

Strengths:

- richer score rendering out of the box
- useful if the app eventually exports/imports MusicXML as a first-class artifact

Tradeoffs:

- heavier than needed for the first melody workflow
- less natural if our source of truth stays as detected note events rather than MusicXML

### 3. `abcjs`

Best fit for fast lead-sheet style rendering from a text notation format.

Strengths:

- simpler mental model for lightweight notation
- useful if we want easy melody display with less engraving control

Tradeoffs:

- less natural for event-level rendering directly from our detection pipeline
- less flexible than VexFlow for custom interactive notation behavior

---

## Recommendation

### Recommend: `VexFlow`

Why:

- the app already owns note timing, pitch, and duration data
- the first workflow is monophonic and constrained
- we need custom mapping from detected note events to displayed notation
- we will likely want playback-linked highlighting and confidence overlays later

`VexFlow` is the best fit for a controlled, product-specific notation layer.

---

## Implementation Strategy

### Phase 1

Build a small app-owned notation adapter:

- input: detected note events
- output: measures + rendered VexFlow notes/rests

Keep the rendering boundary narrow:

- `StaffNotation.tsx`
- `notationLayout.ts`
- `notationMapper.ts`

### Phase 2

Support visual polish and interaction:

- active note highlighting during playback
- compact mobile layout
- confidence indicators for unstable notes

### Phase 3

Evaluate whether `MusicXML` export should map to the same notation model or stay separate.

---

## Open Questions

1. How aggressively should we quantize displayed rhythm versus preserving raw timing?
2. Should the notation view expose a "clean" mode and a "raw" mode?
3. Do we need automatic key signature inference in the staff view, or is neutral notation acceptable for v1?
4. Should rests be explicit in v1, or inferred only where gaps are large enough to matter?

---

## Decision

Use `VexFlow` for melody staff rendering. Keep `MusicXML` as a separate later export decision rather than forcing it into the first display implementation.
