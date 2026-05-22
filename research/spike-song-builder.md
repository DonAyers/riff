# Spike: Song Builder Route

Date: 2026-05-18

## Question

Add a song-builder route where a user records one chord or a chord sequence, sees the detected chords laid out sequentially as text, can reorder them, and can play back a basic generated version. The first version should not infer time signature, meter, bar lines, or song form. The goal is correct chord capture and lightweight arranging.

## Current App Fit

- Routing is currently a small in-app History API router in `src/App.tsx` with `/` and `/tuner`. A builder route can follow the same pattern without adding `react-router`.
- `useRiffSession` already produces `chordTimeline: ChordEvent[]` after analysis.
- `ChordEvent` is already the useful source shape: `{ chord, label, startTimeS, endTimeS }`.
- The existing `ChordTimeline` displays timed chord events, but it is a time-positioned timeline. The builder needs an order-first list/strip, not a proportional timeline.
- Playback already uses `smplr` through `useMidiPlayback`, and `smplr` supports scheduled note playback by `time` and `duration`. This is enough for a basic chord-sequence preview.

## MVP User Flow

1. User opens `/builder` or `/song-builder`.
2. User records or imports a short chord idea using the existing capture workflow.
3. After analysis, the builder shows detected chords as sequential cards/chips: `C Major`, `G Major`, `A minor`, etc.
4. Each card can be selected, deleted, duplicated, and dragged to reorder.
5. Playback generates one simple chord hit or strum per card in the displayed order.
6. Builder state is local to the current detected take at first. Persistence can come later once the edit model feels right.

## Route Recommendation

Use `/builder` as the route.

Why:

- Shorter and easier to scan in nav than `/song-builder`.
- The page title can still be `Song builder`.
- It leaves room for future route children like `/builder/:songId` if saved arrangements are added.

Implementation detail:

- Extend `AppRoute` to `"home" | "tuner" | "builder"`.
- Keep the workspace/session mounted after first visit, same as the tuner route, so pending recordings and detected chords are not lost while navigating.
- Add a `BuilderRoute` component that can either reuse `RiffWorkspace` capture pieces or show a builder-specific capture panel plus builder editor.

## Data Model

Introduce a builder-facing item type derived from `ChordEvent`:

```ts
interface SongBuilderChord {
  id: string;
  chord: string;
  label: string;
  sourceStartTimeS: number;
  sourceEndTimeS: number;
  playbackBeats: number;
  voicing?: string;
}
```

Notes:

- `id` should be stable and independent of index so drag/reorder does not confuse React or playback.
- `sourceStartTimeS` / `sourceEndTimeS` preserve traceability to the detected take without making the builder depend on original timing.
- `playbackBeats` can default to `1` for MVP. We should not infer meter; this is just a simple duration unit for preview.
- `voicing` can be deferred. First playback can use generated pitch classes or existing guitar voicing lookup.

Derivation:

```ts
const builderItems = chordTimeline.map((event, index) => ({
  id: `${event.chord}-${event.startTimeS}-${index}`,
  chord: event.chord,
  label: event.label,
  sourceStartTimeS: event.startTimeS,
  sourceEndTimeS: event.endTimeS,
  playbackBeats: 1,
}));
```

## Chord Correctness First

The main quality risk is still chord detection, not arrangement UI.

The follow-up quality plan is tracked in `research/plan-guitar-chord-detection-quality.md`.

For MVP:

- Use the existing `detectChordTimeline(filtered, PROFILES.guitar.chordWindowS)` output.
- Do not dedupe repeated chords automatically. If the user plays `G, G, C`, show all three cards.
- Do not infer sections, tempo, time signature, or bar boundaries.
- Keep an edit affordance for a card label/chord symbol in a follow-up slice, because detection will sometimes be wrong.

Potential detection improvement later:

- Preserve the notes in each strum cluster so the builder can show confidence/debug details and support manual correction.
- Add a lightweight chord-correction picker backed by `tonal` chord names and existing `lookupVoicings()`.

## Drag / Reorder Options

### Option A: `@dnd-kit/react` / dnd-kit sortable

Good fit for a custom chord strip.

- Modern, active TypeScript project.
- Supports pointer, touch, mouse, and keyboard sensors.
- Built-in accessibility primitives and live regions.
- Extensible collision detection and animation.
- Good if we want custom card/chip UI rather than adopting a collection component library.

Tradeoff:

- We own more of the keyboard interaction and test surface than with React Aria collections.

### Option B: React Aria drag and drop collections

Best accessibility story.

- `useDragAndDrop` supports `onReorder`, drop indicators, keyboard drag mode, and screen-reader announcements.
- Strong built-in semantics if represented as a `ListBox` or `GridList`.

Tradeoff:

- It pulls the builder UI toward React Aria collection patterns and may add more dependency/API surface than this app currently uses.

### Option C: `@hello-pangea/dnd`

Good for classic vertical/horizontal list reorder.

- Maintained fork of `react-beautiful-dnd` with React 19 support.
- Strong list-specific keyboard and screen-reader behavior.

Tradeoff:

- Heavier abstraction and less flexible for a custom horizontally wrapping chord strip. The original `react-beautiful-dnd` is archived/deprecated, so do not use that package directly.

### Recommendation

Start with dnd-kit for the builder MVP.

## Implementation Note

The first implementation pass uses inline recorder/import/analyze controls, generated pitch-class guitar preview, duplicate/delete/move controls, and native drag reorder on the sequence cards. Dedicated arrangement persistence and a richer drag-and-drop library remain follow-up work once the MVP interaction model feels right.

Reasoning:

- The builder wants a custom, compact chord sequence UI rather than a generic listbox.
- We can add explicit non-drag controls (`Move left`, `Move right`) for accessibility and testability, even if dnd-kit handles pointer/touch drag.
- It keeps the visual design close to the current app.

If we decide keyboard/screen-reader drag parity is the primary concern over custom visuals, switch to React Aria before implementation.

## Playback Approach

MVP playback should be generated, not original audio playback.

Recommended implementation:

- Add a `songBuilderPlayback` lib that converts `SongBuilderChord[]` into simple scheduled notes.
- Use `tonal` / `@tonaljs/chord` to turn each chord symbol into pitch classes.
- Map each chord to a compact guitar-friendly register, roughly around `C3` to `E5`.
- Schedule each card at a fixed slot length, e.g. `1.0s` per chord at MVP.
- Use `smplr` `Soundfont` with `acoustic_guitar_steel`, matching `useMidiPlayback`.
- For a guitar feel, strum chord tones with small offsets, e.g. `0ms`, `24ms`, `48ms`, `72ms`, instead of starting every note at exactly the same time.

Important constraints:

- Do not call this timing musical meter yet. It is just preview spacing.
- Playback should be deterministic and based on card order, not original `startTimeS`.
- Stop should cancel scheduled/active notes and reset highlighting.

Possible hook shape:

```ts
interface UseSongBuilderPlaybackReturn {
  duration: number;
  isPlaying: boolean;
  currentIndex: number | null;
  load: (items: SongBuilderChord[]) => void;
  play: () => Promise<void>;
  stop: () => void;
}
```

## Proposed Components

- `SongBuilderRoute` — route-level layout and empty/loading states.
- `SongBuilderCapture` — reuse or wrap recorder/import/analyze controls for this workflow.
- `SongBuilderSequence` — ordered list of chord cards and drag context.
- `SongBuilderChordCard` — displays chord label, order number, optional source time, delete/duplicate/move controls.
- `SongBuilderPlayback` — play/stop controls and active-card highlighting.
- `useSongBuilderSequence` — derives initial sequence from `ChordEvent[]`, owns edits and reset behavior.
- `useSongBuilderPlayback` — schedules generated chord preview.

## UX Shape

- First screen should be the usable builder, not a marketing page.
- Empty state: capture/import prompt plus a quiet area that says there is no chord sequence yet.
- After analysis: show a horizontal or wrapping chord strip for quick scanning.
- Keep the sequence text-first: chord labels are the primary display, not notation or timeline ruler.
- Provide buttons for delete/duplicate/move in addition to drag so the flow remains usable without precision pointer input.
- Consider showing source timing as subtle metadata like `0.84s`, but do not use source timing for layout.

## Persistence Decision

Defer full persistence for MVP.

Reason:

- The current `RiffSession` persists detected analysis, not edited arrangements.
- Builder edits introduce a new domain object: an arrangement derived from a riff. That should not be squeezed into `RiffSession` until we decide whether arrangements are saved independently, attached to a source session, or exported only.

Follow-up storage model:

```ts
interface SongBuilderArrangement {
  id: string;
  name: string;
  sourceSessionId: string | null;
  createdAt: number;
  updatedAt: number;
  chords: SongBuilderChord[];
  playbackSettings: {
    slotDurationS: number;
    strumOffsetMs: number;
    instrument: "acoustic_guitar_steel";
  };
}
```

## Testing Plan

- Unit tests for `chordTimelineToBuilderItems()` preserving order and duplicates.
- Unit tests for reorder/duplicate/delete reducer behavior.
- Unit tests for `builderChordsToPlaybackNotes()` with major/minor/seventh chords and unknown-chord fallback.
- React Testing Library tests for empty, analyzed, reorder button, delete, duplicate, and playback states.
- Playwright happy path: visit `/builder`, record/import fixture, analyze, see chord cards, reorder, play generated preview.
- Regression test: navigating between `/`, `/tuner`, and `/builder` must not drop pending recording or analyzed state.

## Suggested Implementation Slices

1. Route shell: add `/builder`, nav link, SPA rewrite, and tests that the route mounts without losing workspace/session state.
2. Read-only sequence: derive builder items from `chordTimeline` and render text cards in order.
3. Sequence editing: reducer for reorder/delete/duplicate plus move-left/move-right controls.
4. Drag reorder: add dnd-kit and wire pointer/touch drag to the same reducer.
5. Generated playback: convert cards to scheduled chord tones and play through `smplr`.
6. Manual correction: allow selecting/retyping a chord label or choosing from detected candidates.
7. Persistence/export: save arrangements and optionally export generated MIDI/WAV.

## Open Questions

- Should `/builder` include capture controls inline, or should it consume the current take from the main workspace and link back to capture?
- Should repeated adjacent identical chords stay separate by default? Current recommendation: yes.
- Should playback use compact triads only, or use existing guitar voicings when available? Current recommendation: start with generated pitch classes; use voicings later.
- Should the first saved arrangement be attached to `RiffSession`, or stored as a separate IndexedDB object? Current recommendation: separate object after MVP.

## References Checked

- dnd-kit: https://github.com/clauderic/dnd-kit
- React Aria drag and drop: https://react-aria.adobe.com/dnd
- Atlassian Pragmatic Drag and Drop: https://github.com/atlassian/pragmatic-drag-and-drop
- `react-beautiful-dnd` archive/deprecation notice: https://github.com/atlassian/react-beautiful-dnd
- `@hello-pangea/dnd`: https://github.com/hello-pangea/dnd
- smplr playback and sequencer docs: https://github.com/danigb/smplr