# Spike: Guitar-Focused User Stories — Feasibility

**Date:** 2026-03-10  
**Status:** Concluded — promoted to [plan-guitar-lanes.md](plan-guitar-lanes.md)

---

## Stories Under Review

### Story 1 — "What key is this song in?"

> I am trying to learn a song on guitar and I don't know what key it's in → record a clip, key is detected, perhaps a secondary key.

### Story 2 — "What chord am I playing?"

> I play a chord on guitar and I am told what it is AND shown the chord image. A "phrase" button gives an alternate voicing, and a "variate" button suggests a substitution chord that could fit.

---

## Current State of the Codebase

| Capability | Status | Notes |
|---|---|---|
| Polyphonic pitch detection (Basic Pitch) | ✅ Working | Spotify's ML model, runs client-side in worker |
| Guitar instrument profile | ✅ Working | MIDI 40–88, minAmp 0.15, chord window 0.15 s |
| Chord detection | ✅ Basic | Single dominant chord via `Chord.detect()` (Tonal.js) |
| Chord display | ✅ Basic | Text-only label, e.g. "C Major" |
| Note mapping & filtering | ✅ Working | Filters artifacts by amplitude, duration, MIDI range |
| Scale / key detection | ❌ Missing | Not implemented |
| Chord diagrams (fretboard) | ❌ Missing | No visual chord representations |
| Chord voicing alternatives | ❌ Missing | No database of guitar-specific voicings |
| Chord substitution suggestions | ❌ Missing | No harmonic theory engine |
| Multi-chord timeline | ❌ Missing | Only returns a single dominant chord per recording |

---

## Story 1: Key Detection — Feasibility

### What "key detection" actually means

Given a set of detected pitch classes from a recording, determine the **most likely musical key** (e.g. "G Major" or "E Minor"). This is fundamentally a pattern-matching problem: which of the 24 major/minor keys best explains the notes we hear?

### Approach: Krumhansl-Schmuckler key-finding algorithm

The standard approach is **key profiles** — empirically derived weightings of how "important" each pitch class is in each key. The **Krumhansl-Schmuckler algorithm** correlates detected pitch-class frequencies against 24 profiles (12 major + 12 minor) and ranks results by correlation coefficient.

**Good news: Tonal.js already ships this.**

```ts
import { Key } from "tonal";

// Key.majorKey("C") → { scale: ["C", "D", "E", "F", "G", "A", "B"], ... }
// Key.minorKey("A") → { natural: { scale: [...] }, harmonic: {...}, melodic: {...} }
```

However, Tonal.js does **not** include a built-in `detectKey()` function. We'd need to implement the correlation ourselves, which is ~50 lines of code:

1. Count occurrences of each pitch class in the detected notes (weighted by duration or amplitude).
2. For each of 24 candidate keys, compute the Pearson correlation between the pitch-class histogram and the Krumhansl-Kessler profile.
3. Rank by correlation. Return the top 1–2 results.

### Relative major / minor ambiguity

Every major key has a **relative minor** that shares the same notes (e.g. C Major ↔ A Minor). The algorithm handles this naturally — both will rank highly, with the "winner" depending on which tonic pitch class appears more prominently. Presenting the top 2 results lets the user decide.

This directly addresses the user's question about "a secondary" key — that's almost certainly the relative minor (or major).

### Guitar-specific considerations

- **Open strings:** Guitar players often use open strings (E, A, D, G, B, E) which bias pitch-class counts. The existing guitar profile already filters sub-bass and transients, which helps. We may want to weight by **note onset count** rather than raw duration to avoid open-string sustain skewing results.
- **Recording length:** Key detection needs at least ~5–10 notes across a few different pitch classes to be reliable. A single chord (3 notes) is too little — it's a chord, not a key. We should enforce a minimum note count and warn the user otherwise.
- **Capo considerations:** Not a software problem — the detected pitches are already transposed by the capo. Key detection works correctly regardless.

### Feasibility verdict: ✅ Highly feasible

| Aspect | Effort | Risk |
|---|---|---|
| Key detection algorithm | ~50 LOC, 1–2 days | Low — well-understood algorithm, many reference implementations |
| UI — display key with confidence | Small component addition | Low |
| Relative key display | Trivial (Tonal has this data) | None |
| Guitar-specific weighting | Small tweak to histogram | Low |
| **Total** | **~2–3 days** | **Low** |

### Dependencies

- None new. Tonal.js already provides all needed scale/key data structures.

---

## Story 2: Chord Identification + Diagram + Voicings + Substitutions

This story is actually **four distinct features** with very different complexity levels. Let's break them apart.

### 2a. Chord identification — "What chord am I playing?"

**Already working.** The existing `chordDetector.ts` + guitar profile does this. Strum a chord, get "C Major" back. The main improvement needed is:

- **Multi-chord timeline:** Currently we return only the single dominant chord. For a song recording, we need one chord per time cluster. The windowed detection already clusters notes — we just need to return **all** cluster results instead of only the largest. This is a small refactor of `detectChordsWindowed()`.

**Effort:** ~0.5 days. **Risk:** Low.

### 2b. Chord diagram (fretboard image) — "Show me the chord"

This is the first **new** feature. We need to render a guitar fretboard showing finger positions for a given chord.

#### Option A: SVG rendering library

**[`@tombatossals/react-chords`](https://github.com/tombatossals/react-chords)** or **[`@tonaljs/chord-dictionary`](https://github.com/tonaljs/tonal)** + custom SVG.

The challenge: translating a **chord symbol** (e.g. "CM") into **guitar finger positions** (which fret, which string). This is a non-trivial mapping because the same chord has many voicings on guitar.

**Best available dataset:** The `chords-db` package (by tombatossals) contains a JSON database of ~2,300 guitar chord voicings with exact finger positions, barres, and base frets. It's ~150 KB uncompressed.

```json
{
  "C": {
    "major": [
      { "frets": [-1, 3, 2, 0, 1, 0], "fingers": [0, 3, 2, 0, 1, 0], "barres": [], "baseFret": 1 },
      ...
    ]
  }
}
```

#### Option B: Canvas/SVG from scratch

We could render a simple 6-string × N-fret grid ourselves with dots for finger positions. This is ~200 LOC of SVG generation and avoids a dependency, but still needs the chord → position database.

#### Recommendation

Use the **chords-db** dataset (MIT licensed, well-maintained) for the position data, and write a lightweight SVG renderer. This avoids pulling in a full React chord-rendering library (most are outdated) while still getting accurate fingering data.

**Effort:** ~3–4 days. **Risk:** Medium — the tricky part is mapping Tonal.js chord symbols to chords-db lookup keys (naming conventions differ slightly, e.g. `"CM"` vs `"C/major"`).

### 2c. Alternate voicings ("Phrase" button)

The chords-db dataset typically includes **3–8 voicings per chord**. Once we have the chord diagram rendering (2b), this feature is nearly free:

1. Store the current voicing index.
2. On "Phrase" button click, increment the index and render the next voicing from the database.

**Effort:** ~0.5 days after 2b is done. **Risk:** Low.

### 2d. Chord substitution ("Variate" button)

This is the **most complex** feature and gets into real music theory territory.

#### What is chord substitution?

Given a chord (e.g. C Major), suggest another chord that could "fit" in its place. This is context-dependent — the right substitution depends on:

1. **The key** (which we're building in Story 1).
2. **The chord's function** in that key (tonic, dominant, subdominant).
3. **The substitution rules** being applied.

#### Common substitution types (ordered by complexity)

| Substitution | Example (key of C) | Rule | Complexity |
|---|---|---|---|
| **Relative minor/major** | C → Am, Am → C | Shared triadic notes | Trivial |
| **Diatonic substitution** | C → Em (iii for I) | Same function chords within the key | Low |
| **Tritone substitution** | G7 → Db7 | Shared tritone (B–F in both) | Medium |
| **Modal interchange** | C → Cm (borrowed from parallel minor) | Borrow from parallel key | Medium |
| **Secondary dominants** | C → B7 (V7/iii → Em) | Dominant of the target chord | High |
| **Extended / altered** | Cm → Cm7, C → Cmaj9 | Add chord tones | Low |

#### Implementation approach

A **rule-based engine** is feasible and honest about its limitations. No ML/AI needed.

```
Input:  detected chord + detected key
Step 1: Determine chord function (I, ii, iii, IV, V, vi, vii°)
Step 2: Apply substitution rules from a table
Step 3: Return 2–3 suggestions ranked by "closeness"
```

Tonal.js provides the building blocks:
- `Key.majorKey("C").chords` → `["Cmaj7", "Dm7", "Em7", "Fmaj7", "G7", "Am7", "Bm7b5"]`
- `Chord.get("CM").notes` → `["C", "E", "G"]`
- `Note.enharmonic()`, `Interval.distance()`, etc.

#### Challenge: context ambiguity

If the user plays a single C major chord with no other context, we don't know the key. Substitution is meaningless without harmonic context. **Story 1 (key detection) is a prerequisite for meaningful substitutions.**

For the single-chord case, we can still offer:
- Extensions (C → Cmaj7 → Cmaj9)
- Relative minor (C → Am)
- Parallel minor (C → Cm)

These don't require knowing the key.

#### Feasibility verdict for 2d

| Aspect | Effort | Risk |
|---|---|---|
| Basic substitutions (relative, extensions) | ~2 days | Low |
| Diatonic substitutions (requires key) | ~2 days | Medium — depends on Story 1 |
| Tritone + modal interchange | ~2 days | Medium — correctness matters |
| UI for suggestions | ~1 day | Low |
| **Total** | **~5–7 days** | **Medium** |

---

## Dependency Graph

```
Story 1: Key Detection
    └── keyDetector.ts (~50 LOC, Krumhansl-Schmuckler)
    └── KeyDisplay component
    └── Integration into analysis pipeline

Story 2a: Multi-chord timeline (refactor existing)
    └── detectChordsWindowed() returns all clusters

Story 2b: Chord diagrams ← depends on chord-db dataset
    └── ChordFretboard SVG component
    └── Chord symbol → fingering position lookup

Story 2c: Alternate voicings ← depends on 2b
    └── Voicing index cycling over chord-db entries

Story 2d: Chord substitutions ← depends on Story 1 + 2a
    └── Substitution rule engine
    └── Suggestion UI
```

**Suggested implementation order:**

1. **Lane infrastructure** — tab/toggle UI, shared recorder, lane-specific result panels
2. **Song lane:** Story 1 (key detection) → 2a (multi-chord timeline)
3. **Chord lane:** Story 2b (chord diagram) → 2c (alternate voicings)
4. **Cross-lane:** Story 2d (substitutions) — benefits from both lanes being functional

---

## Decision: Two Lanes

Resolved — the two stories map to **two distinct interaction modes ("lanes")**:

| | **Song Lane** | **Chord Lane** |
|---|---|---|
| **Trigger** | Record or import a multi-bar clip | Play a single chord / short strum |
| **Input style** | Long recording (5 s – minutes) | Short burst (< ~3 s) |
| **Primary output** | Key detection + chord timeline | Chord name + fretboard diagram |
| **Secondary output** | Relative key, note summary | Alternate voicing, substitution suggestion |
| **Analysis depth** | Whole-recording pitch histogram → key | Single-cluster chord detection |
| **UI emphasis** | Note timeline view | Large chord diagram, Phrase & Variate buttons |

### Lane switching

Options to consider during design:

- **Explicit tabs/toggle** at the top: "Song" | "Chord". User picks the lane, UI reconfigures.
- **Auto-detect by duration** (secondary heuristic): if the recording is < 3 s and contains a single note cluster, default to Chord lane; otherwise Song lane. Can always be overridden.
- **Shared recorder widget:** Both lanes start from the same Record/Import action — the lane determines what analysis runs and what results are displayed.

Keeping the recorder shared avoids duplicating capture logic. The fork happens **after** notes are detected, at the analysis/display layer.

---

## Open Questions

1. ~~**Scope of "recording"** — RESOLVED: two lanes (see above).~~

2. **Chord naming conventions:** Tonal.js uses symbols like `"CM"`, `"Am7"`, `"Bdim"`. Guitar players often expect Nashville numbers or simpler names. How much formatting polish is needed?

3. **Chord-db licensing & maintenance:** The `chords-db` package is MIT but last published in 2019. We'd want to vendor the JSON data rather than depend on the npm package, in case it vanishes.

4. **Touch/mobile UX:** Chord diagrams need to be legible on phone screens. The current app already has a responsive layout spike (`spike-responsive-layout.md`) — chord diagrams should be designed with mobile-first sizing.

5. **Substitution guardrails:** How "adventurous" should suggestions be? Only diatonic, or also jazz substitutions (tritone, altered dominants)? Consider a "complexity" slider or default to simple.

---

## Risk Summary

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Key detection inaccurate for short recordings | Medium | Medium | Minimum note count threshold; show confidence % |
| Chord symbol mismatch (Tonal ↔ chords-db) | Medium | Low | Build a mapping table; test extensively |
| Substitution suggestions feel random/unhelpful | Medium | High | Start with only the safest substitutions; add more later |
| Chord-db dataset missing chords | Low | Medium | Vendor + extend the dataset as needed |
| Scope creep from "guitar focus" into general music theory | High | Medium | Keep guitar profile as the default; don't build for piano/bass yet |

---

## Recommendation

**Phase 1 — Lane scaffold + Song lane.** Build the two-lane toggle UI with shared recorder, then implement key detection (Story 1) and multi-chord timeline (2a). This gives the Song lane a complete UX.

**Phase 2 — Chord lane.** Implement chord diagram rendering (2b) and voicing cycling (2c). This gives the Chord lane a complete UX.

**Phase 3 — Substitutions (2d).** Defer until both lanes are working. Substitution logic is the most complex piece and has the highest risk of feeling "wrong" to users. It benefits enormously from having key detection (Song lane) integrated and from real user feedback.

The two-lane model keeps each lane focused, avoids overloading a single results screen, and lets us ship each lane independently.
