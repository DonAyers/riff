# Plan: Guitar Chord Detection Quality

## Goal

Make Riff guitar-first by improving the reliability of detected guitar chord timelines before expanding arrangement features.

The builder can only feel useful if the chord cards are trustworthy. UI polish, persistence, richer drag-and-drop, and export should stay secondary until guitar chord detection has repeatable quality gates.

## Scope

In scope:

- Guitar recordings and guitar-like Basic Pitch note output.
- Chord timeline quality, not full melody transcription quality.
- Open chords, barre chords, repeated strums, simple progressions, noisy takes, and picked or arpeggiated chord attacks.
- Test fixtures and synthetic detector-output scenarios that are fast enough to run in Vitest.

Out of scope for this phase:

- Full Range or piano-oriented detection modes.
- Meter or time-signature inference.
- Arrangement persistence.
- Generated MIDI export for builder arrangements.

## Product Direction

The app should behave as guitar-first in the UI now and can become guitar-only internally later.

For now, keep the hidden `default` profile in the data model as compatibility insurance for existing stored sessions and local storage. Remove it fully only when there is a deliberate migration and the guitar-specific pipeline is stable.

## Quality Gates

The core quality gate is a table of guitar chord scenarios that run through the same path as detected audio:

1. Basic Pitch-like `DetectedNote[]` output.
2. `mapNoteEvents()`.
3. `filterNotes(..., PROFILES.guitar)`.
4. `detectChordTimeline(..., PROFILES.guitar.chordWindowS)`.
5. Expected ordered chord labels.

Initial scenarios:

- Six-string open G down-strum with adjacent string attacks.
- Slow picked C major triad where each adjacent onset is inside the guitar window.
- Simple open-chord progression: C, G, Am, F.
- Repeated adjacent C major strums that must remain separate cards.
- Noisy C major with quiet ghost notes, short pick transients, sub-bass artifacts, and high harmonics.

Future scenarios:

- Barre F, Bm, and movable E/A-shape chords.
- Suspended and add9 shapes common on guitar, such as Dsus4, Asus2, Cadd9, and Gsus4.
- Dominant sevenths and minor sevenths.
- Partial chord fragments that should not over-report full chords.
- Capo-like pitch shifts, if the UI later supports transposition.

## Implementation Slices

### Slice 1: Evaluation Harness And Strum Clustering

Status: implemented.

- Add `src/lib/guitarChordQuality.test.ts` as the first fast guitar chord quality gate.
- Change strum clustering from first-onset anchoring to adjacent-onset grouping.
- Keep repeated strums separated when the next attack gap is outside the guitar chord window.

Rationale: a real guitar down-strum or picked chord can span more than the current 0.15 second window while still being one chord. Anchoring the entire cluster to the first onset split these takes into incomplete fragments.

### Slice 2: Fixture Backfill

Add or regenerate fixtures for the scenarios above so at least the most important quality gates also run from real WAV files in Playwright or an import-level integration test.

Keep Vitest synthetic scenarios as the fast inner loop. Use WAV fixtures as slower confidence checks.

### Slice 3: Chord Interpretation Rules

Improve post-detection interpretation before touching builder UI:

- Decide how to handle dyads and power chords.
- Prefer guitar-plausible chord names when Tonal returns inversions or slash-chord alternatives.
- Normalize duplicate-octave pitch classes before scoring.
- Consider minimum chord-tone count by chord family.

### Slice 4: Timeline Cleanup

Improve chord events after raw detection:

- Merge adjacent identical chord events that are fragments of the same strum.
- Preserve repeated strums when there is a clear attack gap.
- Filter very short fragment events unless they are musically meaningful.
- Keep event boundaries useful for builder cards.

### Slice 5: Manual Correction In Builder

Add manual chord-card correction before persistence. This is the practical escape hatch while detection improves.

Recommended controls:

- Edit chord label or choose from likely alternatives.
- Split or merge adjacent cards.
- Mark a card as uncertain when detection confidence is low.

### Slice 6: Full Guitar-Only Model Cleanup

Once quality gates are stable, remove hidden Full Range support from the model and migrate old stored `default` profile values to `guitar`.

## Test Commands

Focused inner loop:

```bash
npx vitest run src/lib/guitarChordQuality.test.ts src/lib/guitarStrumPlayback.test.ts src/lib/chordDetector.test.ts src/lib/profilePipeline.integration.test.ts
```

Full local check:

```bash
npm run test
npm run build
npx playwright test tests/e2e/smoke.spec.ts tests/e2e/instrument-profiles.spec.ts
```

## Current Recommendation

Do not expand builder persistence or drag-and-drop yet. The next feature work should be detection quality: add more guitar chord scenarios, improve chord interpretation, and only then expose more builder editing power.