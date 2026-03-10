# User Stories

Core use cases for Riff, focused on **guitar players** learning songs and exploring chords.

The app is organised into two **lanes** — distinct modes that share a single recorder but present different analysis results. See [plan-guitar-lanes.md](../../research/plan-guitar-lanes.md) for implementation details.

---

## Song Lane — "What key is this in?"

> As a guitar player learning a song, I want to record or import a clip and immediately see the detected key (plus the relative major/minor) so I can figure out which scale to play over it.

**Acceptance criteria:**
- Record a clip or import audio → pitch detection runs automatically.
- Primary key is displayed with a confidence indicator.
- Relative key is shown alongside (e.g. "G Major — relative: E Minor").
- Chord changes are shown on a timeline aligned with the piano roll.
- Short or ambiguous recordings surface a low-confidence warning rather than a wrong answer.

**Status:** Scoped — [plan-guitar-lanes.md](../../research/plan-guitar-lanes.md) Phase 1, Tasks 2–5.

---

## Chord Lane — "What chord am I playing?"

> As a guitar player, I want to strum a chord and instantly see its name, a fretboard diagram showing the fingering, and options to explore alternate voicings or substitution chords.

**Acceptance criteria:**
- Strum a chord → chord name and fretboard diagram are displayed.
- **Phrase** button cycles through alternate voicings of the same chord on the fretboard.
- **Variate** button suggests substitution chords that could fit (e.g. relative minor, extensions, diatonic subs when the key is known).
- Tapping a substitution swaps the fretboard diagram to that chord.

**Status:** Scoped — [plan-guitar-lanes.md](../../research/plan-guitar-lanes.md) Phase 2 (diagram + voicings) and Phase 3 (substitutions).

---

## Future Stories

_Add new stories here as they emerge. Keep each one focused on a single guitar-player use case._
