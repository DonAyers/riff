# Plan: Two Core Workflows

> Date: 2026-03-13  
> Status: Current product roadmap  
> Scope: Focus the app around two workflows only: melody capture and guitar harmony exploration.

---

## Product Frame

Riff should optimize for two jobs:

1. **Capture Melody**  
   User sings, hums, whistles, or plays a single-note riff. The app detects the notes, shows them on a staff, and gives them a useful playback/export path.
2. **Understand Guitar Harmony**  
   User plays a guitar chord, riff, or section. The app detects the key and chord movement, explains the musical relationships, and helps them explore playable chord options.

Everything on the roadmap should clearly improve one of those two jobs.

---

## Product Principles

- **Two clear entry points.** The home experience should present Melody and Guitar as deliberate workflows, not as generic analysis modes.
- **Detection before decoration.** Accuracy, note grouping, sensitivity, and confidence handling matter more than adding extra theory surfaces.
- **Show music as music.** Melody results should emphasize staff notation. Guitar results should emphasize key/chord relationships and playable voicings.
- **Be honest about uncertainty.** Low-confidence detections should be visible in the UI and tunable with input presets/sensitivity.
- **Preview is a guide, not a fake instrument.** Playback should be musically helpful and less misleading, even if it is not a perfect guitar simulation.
- **Theory must be actionable.** Relative major/minor, key relationships, substitutions, and voicings should always answer "what can I do with this?"

---

## Not Doing Now

- Broad multi-instrument positioning beyond melody capture and guitar harmony.
- Deep offline/PWA/platform work unless it directly improves the two workflows.
- Full score engraving or notation editing beyond what is needed to display detected melody cleanly.
- Exotic DAW formats before shipping strong `MIDI` + audio export.
- Large theory surfaces that do not connect to a detected key or chord the user can act on.

---

## Design Direction

- **Landing view:** two large cards or tabs: `Capture Melody` and `Understand Guitar`.
- **Melody visual center:** staff notation, note list summary, preview/export controls.
- **Guitar visual center:** detected key, chord timeline, clickable key card, clickable chord card, compact theory suggestions.
- **Secondary panels:** confidence, sensitivity, and advanced playback/export controls should be present but visually subordinate.
- **Tone:** less generic tool, more musical coach.

---

## Priority Roadmap

## Phase 1 - Focus The Product Shell

### Why

The current app still shows traces of broader scope. The product needs a clearer front door and clearer defaults.

### Tasks

1. Reframe the UI around the two workflows: `Capture Melody` and `Understand Guitar`.
2. Rename or simplify controls so they reflect user intent instead of implementation details.
3. Add input presets:
   - `Voice / humming`
   - `Single-note instrument / riff`
   - `Guitar chord / section`
4. Add one compact sensitivity panel with:
   - detection sensitivity
   - minimum note length
   - dynamics smoothing
   - noise filtering
5. Add confidence messaging to results so weak detections are visible and understandable.

### Done when

- A new user can immediately understand which workflow to choose.
- The app defaults guide users toward the right input mode.
- Low-confidence output is visible instead of silently presented as fact.

---

## Phase 2 - Make Melody Capture Great

### Why

The melody workflow only works if the app can turn rough audio into a clean, readable, replayable musical line.

### Tasks

1. Improve monophonic note cleanup:
   - merge tiny note fragments
   - suppress duplicate micro-onsets
   - smooth unstable pitch flicker
   - preserve rests where useful
2. Add staff notation rendering for detected melodies.
3. Show a clean melody result stack:
   - staff
   - note summary
   - playback controls
   - export controls
4. Improve preview so durations and velocities are musically credible.
5. Ship `MIDI` export as the primary DAW handoff format.
6. Keep audio export alongside MIDI for reference.
7. Add tests for monophonic cleanup, notation rendering, and export flow.

### Done when

- Hummed or single-note inputs produce a readable staff result.
- Playback sounds close enough to be useful for confirmation.
- Exporting to a DAW via `MIDI` is reliable.

---

## Phase 3 - Make Guitar Harmony Great

### Why

The guitar workflow should not stop at naming a chord. It should explain the key center, chord movement, and useful next options.

### Tasks

1. Improve guitar-oriented segmentation for chords, strums, and short sections.
2. Strengthen key + chord summary UI:
   - detected key
   - relative major/minor
   - confidence
   - chord timeline
3. Make the key card clickable and open a relationship view:
   - relative major/minor
   - nearby key relationships
   - scale-degree context
4. Make detected chords clickable and open a chord detail view with:
   - most likely playable voicing
   - alternate voicings
   - grouped "spice it up" suggestions
5. Group chord suggestions by intent:
   - `color`
   - `tension`
   - `substitution`
   - `movement`
6. Add tests for key relationship view, chord detail interactions, and guitar-specific happy paths.

### Done when

- A guitarist can understand what key they are in.
- Clicking a key explains relationships clearly.
- Clicking a chord gives a useful fingering and theory-guided options.

---

## Phase 4 - Playback And Export Fidelity

### Why

The product currently loses trust when detected notes are correct but playback feels obviously wrong.

### Tasks

1. Separate raw detection events from playback shaping.
2. Improve preview instrument selection for melody and guitar contexts.
3. Add velocity and duration smoothing rules that are playback-only.
4. Add better strum playback shaping for guitar clusters.
5. Keep `MIDI` as the main DAW export target.
6. Evaluate whether `MusicXML` should be added later for notation-oriented export.
7. Add listening-test acceptance criteria for playback quality.

### Done when

- Preview playback sounds materially more believable.
- MIDI export remains clean and useful.
- Guitar playback no longer collapses into obviously artificial note stabs.

---

## Priority Order

### Now

1. Product shell refocus
2. Input presets + sensitivity controls
3. Melody cleanup pipeline
4. Staff notation
5. Guitar key/chord interaction model
6. Playback fidelity improvements that improve trust immediately

### Next

1. Key relationship chart
2. Better voicing ranking/data source
3. Better grouped chord suggestion system
4. Stronger DAW export polish

### Later

1. MusicXML export
2. Pitch-bend and articulation work
3. Rich interactive fretboard exploration
4. Broader cross-instrument support

---

## Research Needed

Three focused spikes should drive the next implementation decisions:

1. `research/spike-staff-notation-rendering.md`
2. `research/spike-guitar-harmony-display-stack.md`
3. `research/spike-playback-export-fidelity.md`

---

## Success Criteria

### Melody workflow

- User can record a melody and see a readable staff.
- User can replay it with useful timing/dynamics.
- User can export it to a DAW via MIDI without cleanup frustration.

### Guitar workflow

- User can record a chord progression or riff and see key + chord results.
- User can click the key and understand its musical relationships.
- User can click the chord and get a playable shape plus meaningful extension/substitution ideas.

---

## Immediate Next Build Slice

If the team wants one focused implementation sequence, do this next:

1. Rework the shell around the two workflows.
2. Add input presets + sensitivity controls.
3. Improve monophonic cleanup and ship staff notation.
4. Improve playback shaping and MIDI export trust.
5. Add key relationship view and richer chord detail interactions.
