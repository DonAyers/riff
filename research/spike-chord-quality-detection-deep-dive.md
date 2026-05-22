# Spike: Chord Quality Detection - Root Causes and Implementation Plan

**Date:** 2026-05-21  
**Status:** Research complete - ready for implementation  
**Scope:** Why detected chords collapse to basic triads; actionable plan to improve chord quality detection.

## Goal

Identify why the current pipeline returns basic labels like C Major or A Minor when a player voices dominant 7ths, maj7, sus4, add9, power chords, or other common guitar colors. Produce an implementation plan that stays client-side and fits the existing Basic Pitch -> note mapping -> chord timeline pipeline.

## Files inspected

| File | Role |
|---|---|
| `src/lib/chordDetector.ts` | Core detection and formatting; primary change target |
| `src/lib/guitarStrumPlayback.ts` | `buildStrumClusters` adjacent-onset grouping |
| `src/lib/noteMapper.ts` | `mapNoteEvents` and profile filtering |
| `src/lib/instrumentProfiles.ts` | Guitar thresholds and chord window |
| `src/lib/guitarChordQuality.test.ts` | Fast synthetic guitar quality gates |
| `src/lib/profilePipeline.integration.test.ts` | Pipeline integration scenarios |
| `src/lib/chordDetector.test.ts` | Unit tests for detector behavior |
| `src/lib/chordSuggestions.ts` | Existing richer chord label formatting pattern |
| `src/hooks/useRiffSession.ts` | End-to-end analysis flow |
| `src/workers/pitchDetection.worker.ts` | Basic Pitch output conversion |

## Root causes

### 1. `formatChordName` erases extended qualities

`src/lib/chordDetector.ts` maps only `Major`, `Minor`, `Diminished`, and `Augmented` qualities. Because Tonal returns `quality: "Major"` for symbols such as `Cmaj7` and `Cadd9`, the formatter displays those as plain `C Major`. Similarly, `Am7` becomes `A Minor`, and `G7` can fall back to `G dom`.

This means some "detection" failures are actually display failures: the detector may already return the richer symbol, but the UI loses it during formatting.

### 2. Bass/root information is discarded

`detectChordTimeline` reduces a note cluster to a de-duplicated pitch-class list before detection. That throws away the lowest MIDI note, which is usually the strongest guitar root cue. Tonal supports a root hint via `Chord.detect(pitchClasses, false, rootPitchClass)`, but the current code does not use it.

### 3. The detector blindly picks `Chord.detect()[0]`

The current public detector returns the first Tonal candidate without any app-level ranking. That is brittle for guitar voicings with open strings, inversions, and extra resonances. The app should prefer non-slash chords whose tonic matches the bass note before considering inversions or unrelated slash candidates.

### 4. Amplitude is only a binary filter

After profile filtering, a loud root and a quiet sympathetic resonance have equal influence on chord naming. This can make a barely audible open string change the candidate pool as much as the main fretted tones. A per-pitch-class amplitude sum should be used as a tiebreaker during candidate ranking.

### 5. Power chords and dyads are silently dropped

`Chord.detect(["E", "B"])` returns no candidate, so two-note root/fifth clusters disappear. A perfect fifth dyad is common enough for guitar that it should produce `E5`/`A5` style symbols, rooted by the bass pitch class.

### 6. Omitted-fifth fallback is missing

Some valid guitar voicings omit or lose the fifth after amplitude filtering. If full-set detection fails, retrying the highest-amplitude pitch classes can recover a stable label without broadening the whole pipeline.

## Recommended implementation plan

All changes can stay inside `src/lib/chordDetector.ts`, with one cleanup in `src/lib/chordSuggestions.ts` after formatting is fixed.

1. **Fix chord formatting first.** Make `formatChordName` alias-aware: handle `maj7`, `m7`, `7`/`dom`, `sus2`, `sus4`, `add9`, `m9`, `9`, `5`, diminished, and augmented before falling back to major/minor. Then reuse this formatter from `chordSuggestions.ts` to avoid duplicated label logic.
2. **Add bass-aware detection.** Introduce `detectChordWithBass(pitchClasses, bassPC, pcWeights?)`, call Tonal with a root hint, and rank candidates by root match/non-slash preference.
3. **Use amplitude-weighted ranking.** In `detectChordTimeline`, build a `Map<pitchClass, summedAmplitude>` for each cluster and pass it into the ranking helper.
4. **Support power chords.** If a two-pitch-class cluster spans a perfect fifth/fourth relative to the bass, return `${bassPC}5`.
5. **Add a conservative fallback.** When full-set detection has no candidates and there are more than three pitch classes, retry with the three highest-weighted pitch classes before giving up.

## Test strategy

Add failing tests before implementation, then make them pass:

- `formatChordName("G7")` -> `G dominant 7`
- `formatChordName("Am7")` -> `A minor 7`
- `formatChordName("Cmaj7")` -> `C major 7`
- `formatChordName("Cadd9")` -> `C add9`
- `formatChordName("Dsus4")` -> `D sus4`
- `formatChordName("E5")` -> `E power chord`

Extend `src/lib/guitarChordQuality.test.ts` with guitar voicings:

| Scenario | Input MIDIs | Expected label |
|---|---|---|
| Open G7 | 43,47,50,53,59,65 | `G dominant 7` |
| C major 7 | 48,52,55,59 | `C major 7` |
| A minor 7 | 45,52,57,60,64,67 | `A minor 7` |
| D sus4 | 50,55,57,62 | `D sus4` |
| C add9 | 48,52,55,62 | `C add9` |
| E power chord | 40,47 | `E power chord` |
| Barre F major | 41,48,53,57,60,65 | `F Major` |
| Open Bm7 | 47,54,57,62,66 | `B minor 7` |

Add integration coverage in `src/lib/profilePipeline.integration.test.ts` for at least open G7 and Cadd9 flowing through `mapNoteEvents -> filterNotes -> detectChordTimeline`.

## Files to change

| File | Change |
|---|---|
| `src/lib/chordDetector.ts` | Rewrite `formatChordName`; add bass-aware candidate detection/ranking; update timeline detection to pass bass and amplitude weights; add power-chord path |
| `src/lib/chordDetector.test.ts` | Add formatter and bass-aware detector unit tests |
| `src/lib/guitarChordQuality.test.ts` | Add extended chord quality gate scenarios |
| `src/lib/profilePipeline.integration.test.ts` | Add richer chord integration fixtures |
| `src/lib/chordSuggestions.ts` | Delegate display names to `formatChordName` after formatter is fixed |

## Relationship to `plan-guitar-chord-detection-quality.md`

This spike expands Slice 3 (Chord Interpretation Rules) and part of Slice 4 (Timeline Cleanup). Slice 1 is already implemented, and the strum clustering algorithm does not need to change for this work.

## Conclusion

The quality gap is not a Basic Pitch model limitation alone. The app currently loses chord quality through formatting, root ambiguity, unweighted candidate selection, and unsupported dyads. Fixing those points should improve detection of common guitar colors without adding dependencies or changing the worker/pipeline architecture.
