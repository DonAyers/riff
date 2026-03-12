# Guitar Lanes — Actionable Development Plan

> Derived from the guitar-stories spike (2026-03-10).  
> Supersedes the generic analysis flow with a **two-lane** UX model focused on guitar players.  
> Tasks are ordered by phase. Complete each phase before moving to the next.

---

## Architecture: Two Lanes

The app will present two distinct interaction modes sharing a single recorder:

| | **Song Lane** | **Chord Lane** |
|---|---|---|
| **When** | Record / import a multi-bar clip | Play a single chord / short strum |
| **Input** | Long recording (≥ ~3 s) | Short burst (< ~3 s) |
| **Primary result** | Detected key + chord timeline | Chord name + fretboard diagram |
| **Secondary result** | Relative key, note summary, note timeline | Alternate voicing, substitution suggestion |

**Lane switching:** Explicit "Song" | "Chord" toggle at the top of the UI. Optional auto-detect heuristic (< 3 s with a single note cluster → Chord lane) can default the toggle after analysis; user can always override.

**Shared infrastructure:** Recorder, audio import, pitch detection worker, note mapping, and guitar profile are reused by both lanes. The fork happens at the analysis/display layer.

---

## Phase 1 — Lane Scaffold + Song Lane

Build the two-lane UI shell and deliver the Song lane end-to-end.

---

### Task 1 · Two-Lane Toggle UI `P1`

**Why:** The lane model is the new top-level UX concept. Everything else hangs off it.

**Steps:**
1. Add a `LaneToggle` component — a two-segment control ("Song" / "Chord") rendered above the results area.
2. Store the active lane in `App.tsx` state (default: `"song"`).
3. Conditionally render lane-specific result panels:
   - Song lane → `KeyDisplay`, `ChordTimeline`, `PianoRoll`, `NoteDisplay`
   - Chord lane → `ChordDiagram` (placeholder), `ChordDisplay`
4. Keep the `Recorder` component shared — it always appears regardless of lane.
5. Wire the instrument profile to default to **Guitar** (can still be changed).

**Done when:** The toggle switches between two visually distinct result panels; existing analysis flows still work in the Song lane.

---

### Task 2 · Key Detection Engine `P1`

**Why:** This is the Song lane's primary feature — "What key is this song in?"

**Steps:**
1. Create `src/lib/keyDetector.ts` implementing the Krumhansl-Schmuckler algorithm:
   - Define Krumhansl-Kessler profiles for 12 major and 12 minor keys (published weightings).
   - `buildPitchClassHistogram(notes: MappedNote[]): number[]` — count weighted occurrences of each pitch class (weight by onset count, not duration, to avoid open-string bias).
   - `detectKey(notes: MappedNote[]): KeyResult[]` — correlate histogram against all 24 profiles, return top results sorted by correlation coefficient.
   - `KeyResult = { key: string; mode: "major" | "minor"; confidence: number }`.
2. Create `src/lib/keyDetector.test.ts`:
   - C major scale notes → detects C Major with highest confidence.
   - A minor scale notes → detects A Minor.
   - Ambiguous input (C major triad only) → low confidence, warn user.
   - Empty / single note → returns empty results.
3. Enforce a minimum note count (≥ 5 unique pitch classes recommended) — return a `lowConfidence` flag when under threshold.

**Done when:** Unit tests pass; key detection is accurate for major and minor scale note sets.

**Dependencies:** None new. Uses Tonal.js `Key` module already in the bundle.

---

### Task 3 · Key Display Component `P1`

**Why:** Users need to see the detected key prominently in the Song lane.

**Steps:**
1. Create `src/components/KeyDisplay.tsx`:
   - Show primary key (e.g. "G Major") with confidence indicator.
   - Show relative key below (e.g. "relative: E Minor") — derive via Tonal `Key.majorKey(k).minorRelative` or vice versa.
   - If `lowConfidence`, show a muted warning: "Record a longer clip for a more accurate result."
2. Create `src/components/KeyDisplay.css` — style consistent with `ChordDisplay`.
3. Add `KeyDisplay.test.tsx`:
   - Renders key name and relative key.
   - Shows confidence warning when flagged.
   - Renders nothing when no key result.

**Done when:** Component renders correctly in Storybook-style isolation tests; integrated into Song lane panel.

---

### Task 4 · Multi-Chord Timeline `P2`

**Why:** The Song lane needs to show chord changes over time, not just a single dominant chord.

**Steps:**
1. Refactor `detectChordsWindowed()` in `src/lib/chordDetector.ts`:
   - Instead of returning only the largest cluster's chord, return **all** clusters: `ChordEvent[] = { chord: string; startTimeS: number; endTimeS: number }[]`.
   - Keep the existing single-chord API as a convenience wrapper.
2. Update `src/lib/chordDetector.test.ts`:
   - Test that multiple clusters each get their own chord.
   - Test that single-cluster recordings still work.
3. Create `src/components/ChordTimeline.tsx`:
   - Horizontal bar showing chord symbols at their time positions.
   - Aligned with the existing `PianoRoll` time axis.
4. Create `src/components/ChordTimeline.test.tsx`:
   - Renders chord labels at correct positions.
   - Renders empty state when no chords detected.
5. Integrate into Song lane results panel, above or below `PianoRoll`.

**Done when:** A multi-chord recording shows each chord at its correct time position in the Song lane.

---

### Task 5 · Song Lane Integration + E2E Test `P2`

**Why:** Everything wired together, with confidence that the full flow works.

**Steps:**
1. Wire `keyDetector.detectKey()` into the analysis pipeline in `usePitchDetection.ts` (or a new `useAnalysis` hook that orchestrates key + chord detection from mapped notes).
2. Pass key results + chord timeline to Song lane panel.
3. Add Playwright e2e test `tests/e2e/song-lane.spec.ts`:
   - Import a known audio fixture → verify key is displayed.
   - Verify chord timeline renders at least one chord event.
4. Verify existing e2e tests still pass (no regressions from lane refactor).

**Done when:** End-to-end flow works: record/import → see key + chord timeline in Song lane.

---

## Phase 2 — Chord Lane

Deliver the Chord lane end-to-end.

---

### Task 6 · Vendor Chord Voicing Dataset `P1`

**Why:** We need guitar fingering data to render fretboard diagrams. The `chords-db` dataset (MIT, ~2,300 voicings) is the best available source.

**Steps:**
1. Download the `chords-db` guitar JSON data (from tombatossals/chords-db on GitHub).
2. Vendor into `src/data/guitar-chords.json` — do not add the npm package (last published 2019).
3. Create `src/lib/chordVoicings.ts`:
   - `lookupVoicings(chordSymbol: string): GuitarVoicing[]` — maps a Tonal.js chord symbol to the chords-db format and returns all available voicings.
   - `GuitarVoicing = { frets: number[]; fingers: number[]; barres: number[]; baseFret: number }`.
   - Build a **symbol mapping table** to translate between Tonal naming (`"CM"`, `"Am"`, `"Bdim"`) and chords-db keys (`"C/major"`, `"A/minor"`, `"B/dim"`).
4. Create `src/lib/chordVoicings.test.ts`:
   - Known chords return voicings (C Major, Am, G7, etc.).
   - Unknown/exotic chords return empty array gracefully.
   - Symbol mapping covers at least: major, minor, 7, maj7, min7, dim, aug, sus2, sus4.

**Done when:** `lookupVoicings("CM")` returns ≥ 1 voicing with correct fret data; tests pass.

---

### Task 7 · Fretboard Diagram SVG Component `P1`

**Why:** This is the Chord lane's hero feature — "show me the chord."

**Steps:**
1. Create `src/components/ChordFretboard.tsx`:
   - Renders a guitar fretboard (6 strings × 4–5 visible frets) as inline SVG.
   - Inputs: `voicing: GuitarVoicing`, optional `chordName: string`.
   - Renders: fret grid, finger dots (numbered), barre lines, open/muted string indicators (O / X above nut), base fret label when position is above fret 1.
   - Mobile-first sizing: minimum 200 px wide, scales up.
2. Create `src/components/ChordFretboard.css`.
3. Create `src/components/ChordFretboard.test.tsx`:
   - Renders correct number of finger dots for a known voicing.
   - Shows "X" for muted strings (fret = -1).
   - Shows "O" for open strings (fret = 0).
   - Shows barre indicator when voicing has barres.

**Done when:** A C Major open chord renders as a recognizable fretboard diagram; tests pass.

---

### Task 8 · Voicing Cycling ("Phrase" Button) `P2`

**Why:** Guitar players want to see alternate ways to play the same chord.

**Steps:**
1. In the Chord lane result panel, add state for `voicingIndex` (default 0).
2. Render the current voicing via `ChordFretboard`.
3. Add a "Phrase" button that increments `voicingIndex` (wrapping around when all voicings are exhausted).
4. Show "voicing 2 of 5" indicator so the user knows how many exist.
5. Add test: clicking Phrase cycles through voicings and wraps.

**Done when:** User can tap Phrase repeatedly to see all available voicings for the detected chord.

---

### Task 9 · Chord Lane Integration + E2E Test `P2`

**Why:** Full Chord lane flow wired and verified.

**Steps:**
1. Wire Chord lane panel: after analysis, if lane is "chord", pass the detected chord to `lookupVoicings()` and render `ChordFretboard` + `ChordDisplay` + Phrase button.
2. If no chord detected, show helpful empty state ("Strum a chord and we'll identify it").
3. Add Playwright e2e test `tests/e2e/chord-lane.spec.ts`:
   - Import a single-chord audio fixture → verify chord name + fretboard diagram renders.
   - Click Phrase → verify diagram updates.
4. Verify lane toggle switches correctly between Song and Chord results.

**Done when:** End-to-end flow works: strum/import a chord → see name + fretboard in Chord lane.

---

## Phase 3 — Chord Substitutions (Deferred)

Ship after Phases 1–2 are solid and real user feedback is collected.

---

### Task 10 · Substitution Rule Engine `P3`

**Why:** The "Variate" button — suggest an alternative chord that could fit.

**Steps:**
1. Create `src/lib/chordSubstitution.ts`:
   - `suggestSubstitutions(chord: string, key?: string): Substitution[]`
   - **Without key context** (Chord lane, single chord): offer extensions (C → Cmaj7), relative minor/major (C → Am), parallel mode (C → Cm).
   - **With key context** (Song lane, or after key is detected): add diatonic substitutions (I ↔ iii ↔ vi), tritone subs for dominant chords.
   - `Substitution = { chord: string; label: string; rule: string }` — e.g. `{ chord: "Am", label: "A Minor", rule: "Relative minor" }`.
2. Create `src/lib/chordSubstitution.test.ts`:
   - C Major without key → returns Am, Cmaj7, Cm.
   - C Major in key of C → returns Em (iii), Am (vi) as diatonic subs.
   - G7 in key of C → returns Db7 (tritone sub).
   - Unknown chord → returns empty array.
3. Start conservative — only the safest substitutions. Expand based on feedback.

**Done when:** Unit tests pass; substitutions are musically sensible for common guitar chords.

**Dependencies:** Tonal.js `Key`, `Chord`, `Note` modules (already in bundle).

---

### Task 11 · "Variate" Button UI `P3`

**Why:** Surface substitution suggestions in the Chord lane.

**Steps:**
1. Add a "Variate" button next to "Phrase" in the Chord lane.
2. On click, call `suggestSubstitutions()` with the current chord (and key, if detected in a previous Song lane session).
3. Show suggestions as a small list / chips: chord name + rule label (e.g. "Am — Relative minor").
4. Tapping a suggestion replaces the active chord diagram with that chord's voicing.
5. Add test: Variate shows suggestions; tapping one updates the diagram.

**Done when:** User can tap Variate and explore substitution options with fretboard diagrams.

---

### Task 12 · Cross-Lane Key Context `P3`

**Why:** Substitutions are much better when we know the key. If the user already analyzed a song in the Song lane, we can carry that key context into the Chord lane.

**Steps:**
1. Persist the most recently detected key in app state (or session storage).
2. When in Chord lane, if a key is available, pass it to `suggestSubstitutions()` for richer results.
3. Show "in key of G Major" context label in Chord lane when key is available.
4. Add test: key context from Song lane flows into Chord lane substitution logic.

**Done when:** Substitution suggestions improve when the user has previously detected a key.

---

## Summary Checklist

| # | Task | Phase | Priority | Status |
|---|---|---|---|---|
| 1 | Two-lane toggle UI | 1 | 🟡 P1 | [ ] |
| 2 | Key detection engine | 1 | 🟡 P1 | [ ] |
| 3 | Key display component | 1 | 🟡 P1 | [ ] |
| 4 | Multi-chord timeline | 1 | 🟠 P2 | [ ] |
| 5 | Song lane integration + e2e | 1 | 🟠 P2 | [ ] |
| 6 | Vendor chord voicing dataset | 2 | 🟡 P1 | [ ] |
| 7 | Fretboard diagram SVG component | 2 | 🟡 P1 | [ ] |
| 8 | Voicing cycling ("Phrase") | 2 | 🟠 P2 | [ ] |
| 9 | Chord lane integration + e2e | 2 | 🟠 P2 | [ ] |
| 10 | Substitution rule engine | 3 | 🟢 P3 | [ ] |
| 11 | "Variate" button UI | 3 | 🟢 P3 | [ ] |
| 12 | Cross-lane key context | 3 | 🟢 P3 | [ ] |
