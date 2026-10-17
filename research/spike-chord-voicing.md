# Spike: Detecting how a chord is voiced, not just which chord

**Date:** 2026-10-14
**Status:** Steps 1 and 2 implemented (see `src/lib/voicingSolver.ts`); step 3 and timbre-based string ID not started
**Ask (Don):** detect "the correct phrasing" of a chord, not just its name.

## What "phrasing" means here

Working interpretation (correct me if this is off):

1. **Inversion / bass note.** C vs C/E vs C/G.
2. **The actual stack of notes, with octaves.** e.g. C3 E3 G3 C4 E4 (open C) vs G2 C3 E3 G3 C4 (C/G).
3. **The shape and neck position.** Open C, A-shape barre at fret 3, E-shape barre at fret 8, a triad on the top three strings.
4. **Which strings are sounding.** `x32010` vs `332010`.

A cheap bonus that may also be what "phrasing" means: **strum direction and arpeggiation** (down/up strum, picked vs strummed), which falls out of the onset order of the notes.

## How Riff works today (checked in code)

- Basic Pitch runs in a worker and returns notes with **exact MIDI pitch, onset, duration and amplitude** (`src/workers/pitchDetection.worker.ts`, `src/lib/noteMapper.ts`). Octave information survives all the way to `MappedNote`.
- `detectChordTimeline` (`src/lib/chordDetector.ts`) clusters notes per strum, then **collapses them to pitch classes** for naming. It already passes the lowest note as `bassPitchClass`, so slash chords (`C/E`) can come out, and `formatChordName` renders `/E`.
- The fretboard shown under a chord is **not the shape that was played**. `lookupVoicings(chordName)` (`src/lib/chordVoicings.ts`) returns a hard-coded dictionary entry or an E/A-shape barre from `chordVoicingsGenerator.ts`. `App.tsx:494` and `SelectedChordDialog.tsx:23` only pass the chord name, never the detected notes.

So the gap is mostly in **what we do with data we already have**: we know which pitches sounded in which octave, and then throw that away before the fretboard is drawn.

### Gotcha found while reading: the Basic Pitch call has shifted arguments

`pitchDetection.worker.ts:149` calls

```ts
module.outputToNotesPoly(frames, onsets, confidenceThreshold, onsetThreshold, maxPolyphony)
```

but the published signature (`@spotify/basic-pitch@1.0.1`, `types/toMidi.d.ts`) is

```ts
outputToNotesPoly(frames, onsets, onsetThresh = 0.5, frameThresh = 0.3, minNoteLen = 5,
                  inferOnsets = true, maxFreq = null, minFreq = null, melodiaTrick = true, energyTolerance = 11)
```

So `confidenceThreshold` is used as the onset threshold, `onsetThreshold` as the frame threshold, and **`maxPolyphony` (6 for guitar) is actually `minNoteLen` in frames** (about 70 ms at 22050/256 fps). Basic Pitch's JS post-processing has no polyphony cap at all. The values happen to sit close to the library defaults, so detection works, but the knobs don't mean what their names say. Worth fixing before tuning anything voicing-related. (Basic Pitch's `minFreq`/`maxFreq` would only duplicate the profile's existing `midiRange` filter, so they aren't worth adding.)

## Approaches surveyed

### A. Chroma / pitch-class profiles (HPCP, NNLS chroma, Chordino)

The classic MIR chord-recognition route. It folds all energy into 12 pitch classes, so **it cannot tell voicings apart by design**. Chordino adds a separate bass chroma, which gives inversions but nothing about shape or strings. Essentia's `ChordsDetection` (also in Essentia.js) only outputs major/minor triads from an HPCP sequence ([docs](https://essentia.upf.edu/reference/std_ChordsDetection.html), [tutorial](https://essentia.upf.edu/tutorial_tonal_chords.html)), and Essentia is AGPL-3.0. Riff's Basic Pitch notes already carry strictly more information. **Not recommended.**

### B. Use the polyphonic notes we already have (Basic Pitch) for bass + stack

Basic Pitch gives note-level MIDI with octave. Inversion and note stack are a few lines on top of what exists. Main risks, all specific to guitar on a phone:

- **Low E (82 Hz) is the weakest note on phone mics**, which roll off the low end (inferred, worth verifying with recordings). A missed bass note turns `C/G` into `C`, or makes the 3rd look like the bass.
- **Octave/harmonic ghosts:** a quiet note an octave above a loud one, or a sub-octave artifact below the real bass. The current amplitude filter (`minAmplitude: 0.15`) helps; the solver also treats quiet notes 12, 19 or 24 semitones above a louder chord tone as likely overtones.
- **Sympathetic open strings** ring without being strummed and can add a "bass" note.

Mitigations: require the bass candidate to persist for most of the cluster, weight by amplitude, and ignore a lowest note that is an exact octave of a louder chord tone only when it is much quieter. **Recommended, cheap.**

### C. Infer fret positions from the exact pitches (symbolic "tab" solving)

Given the MIDI notes of one strum and a tuning, enumerate every way to put each note on a distinct string, then score for playability. With at most 6 notes and about 2–3 candidate positions each, brute force is tiny (well under a millisecond).

This is a well-studied problem:

- **Sayegh (1989)** framed fingering as a shortest path through a layered graph of candidate fingerings, with costs for difficulty and position change (Viterbi). **Radicioni** added phrase segmentation; **Radisavljevic & Driessen** learned the cost weights by gradient descent. **Hori & Sagayama (ISMIR 2016)** proposed minimising the *hardest* move instead of the sum ([paper](https://archives.ismir.net/ismir2016/paper/000285.pdf)). A 2024 paper by Bontempi et al. revisits the same lineage ([arXiv 2407.09052](https://www.arxiv.org/pdf/2407.09052)).
- **Fretting-Transformer (ICMC 2025)** does MIDI→tab with a T5 model and reports beating A* and Guitar Pro ([arXiv 2506.14223](https://arxiv.org/html/2506.14223v1)). Overkill for chords; useful as evidence the rule-based baseline is strong enough to beat only with a lot of data.
- **Open-source code to borrow ideas from:** `chord-fingering` (JS, built on tonal, enumerates fingerings for any chord and tuning with a difficulty score; **GPL-3.0**, so read for ideas, don't vendor it into ISC Riff) ([repo](https://github.com/hyvyys/chord-fingering)); `tuttut` (Python, HMM over a fretboard graph) ([PyPI](https://pypi.org/project/tuttut/)); `gtrsnipe` (MIDI→tab with a fingering scorer) ([HN](https://hn.svelte.dev/item/44698007)).

Hard constraints: one note per string, fretted span ≤ 4 frets (5 with a stretch), at most 4 fretting fingers unless a barre covers the rest. Soft costs: neck height, span, number of fingers, muted strings *between* sounding strings, distance from the previous chord's position, and a bonus for matching a known shape (open, CAGED barre, triad grip).

**Ambiguity is the real limit.** The same pitches can often be played in 2–3 places (E4 is open 1st string, 5th fret B, 9th fret G). Pitch alone can't settle that; the priors (common shapes, staying near the previous chord) settle it most of the time for chord playing. Basic Pitch misses, especially a missed low string, are handled by matching against a library of full shapes with a tolerance ("5 of 6 notes match an E-shape at fret 3") rather than solving only the heard notes.

**Recommended. This is the core of the feature.**

### D. Identify the string from the sound itself (timbre / inharmonicity)

Each string has a different inharmonicity and spectral envelope, so the same pitch on the 3rd string sounds measurably different from the 2nd. Research results:

- **Barbancho et al. (IEEE TASLP 2012)** use inharmonicity to recover string/fret, including chords.
- **Kehling et al. (DAFx 2014)** full electric-guitar pipeline: about 82% string-number accuracy.
- **Abeßer (2013)** spectral-envelope features + SVM: F ≈ 0.90 on six-string electric.
- **Hjerrild & Christensen (ICASSP 2019 / WASPAA 2019)** physical-model pitch estimator, needs training from one fret per string, degrades below 20 dB SNR ([WASPAA paper](https://vbn.aau.dk/ws/portalfiles/portal/307980405/WASPAA19_paper.pdf)).
- **NTUA (ICASSP 2022)** inharmonicity per note, then a genetic algorithm for playability ([paper](https://robotics.ntua.gr/wp-content/uploads/sites/2/BastasKoutoupis_TablatureTranscription_ICASSP22_Paper.pdf)). **GS-Detector** is a small monophonic implementation ([repo](https://github.com/mogeadis/GS-Detector)).
- **Fretiq (arXiv 2607.18303, 2026)** claims *browser-native* electric-guitar string classification with engineered spectral features ([PDF](https://arxiv.org/pdf/2607.18303)). I could not open it from here, so its numbers and licence are unverified.

Catches: almost all of this is **monophonic**, assumes clean DI or close-miked guitar, and is **per-guitar calibrated**. A strummed chord through a phone mic in a room is the hardest case for all of it. **Not now. Revisit only if C's ambiguity turns out to annoy people in practice**, and then as a tie-breaker between C's top two candidates, not a replacement.

### E. End-to-end audio→tab model (TabCNN and successors)

**TabCNN (Wiggins & Kim, ISMIR 2019)** maps a CQT spectrogram straight to per-string fret states. Tab F1 about 0.75 on GuitarSet; on real electric guitar it drops much further unless trained with augmentation (Pedroza et al., DAFx 2024, +10 points on their EGSet12) ([arXiv 2405.14679](https://arxiv.org/html/2405.14679v3)).

For Riff: a second model to download, convert to TF.js, and run on phones next to Basic Pitch; trained on GuitarSet (acoustic, hex-pickup clean recordings), so domain shift to a phone mic is likely; and it still loses to "Basic Pitch notes + a good symbolic solver" for chords, where the shape priors are strong. **Not recommended** for an offline PWA.

## Recommendation

Build it in three small, testable steps, all in `src/lib` and all client-side, no new model:

1. **Fix the Basic Pitch call and harden the bass note.** Correct the `outputToNotesPoly` argument mapping and make the bass note persistence- and amplitude-aware. Show the inversion in words ("C major, 1st inversion (E in bass)") and the note stack in octave order.
2. **Add a voicing solver (`src/lib/voicingSolver.ts`).** Input: one cluster's `MappedNote[]` plus tuning (reuse `TUNING_PRESETS` from `guitarTuner.ts` so drop-D etc. work for free). Output: ranked `GuitarVoicing[]` with a confidence and which strings were heard vs inferred. Generate candidates two ways: direct string assignment of the heard notes, and tolerant matching against a shape library (existing dictionary + CAGED/triad shapes moved across the neck). Then run a Viterbi pass over the chord timeline so consecutive chords stay in the same neck region. Feed the top voicing into `ChordFretboard` instead of `lookupVoicings`, falling back to the dictionary when confidence is low, and mark low-confidence strings visually.
3. **Strum direction from onset order** (if that's the "phrasing" you meant): low-to-high onsets inside a cluster = down-strum, high-to-low = up, spread > ~60 ms = arpeggio. Basic Pitch onsets are frame-quantised at ~11.6 ms, so this needs testing on real strums before trusting it.

Skip chroma (A), timbre string ID (D) and audio-to-tab models (E) for now; D is the only one worth a later spike, as a tie-breaker.

### Testing (per CLAUDE.md)

- **Vitest:** solver unit tests on known shapes (open C `x32010`, C/G `332010`, A-shape C at fret 3 `x35553`, E-shape C at fret 8, drop-D D5), missing-low-string and ghost-octave cases, and the Viterbi staying-in-position case. Extend `guitarChordQuality.test.ts` / `profilePipeline.integration.test.ts` with expected voicings, not just labels.
- **Ground truth:** GuitarSet ships string+fret annotations for 360 recordings, so the solver can be scored offline against real playing (check its licence before committing any fixture).
- **Playwright:** one happy path that loads the demo notes and asserts the fretboard shows the played shape (e.g. `x32010`) and the inversion label.

## Open questions for Don

1. Is the interpretation above right, or did "phrasing" mean strum direction / rhythm / picking pattern?
2. When the shape is ambiguous, show the best guess only, or the best guess plus "also playable at…"?

## Datasets for calibration (follow-up)

- **GuitarSet** (Zenodo 1422265): 360 acoustic recordings, 6 players, per-string fret labels and chord labels. Standard tuning only. Best ground truth for the solver.
- **Guitar-TECHS** (ICASSP 2025, CC BY 4.0): electric guitar, triads and 7ths on several mics/rigs; MIDI labels, no frets.
- **IDMT-SMT-Guitar** (Fraunhofer): isolated notes and chords with string labels on 3 guitars.
- Alternate tunings aren't covered by any of them; generate labelled chords synthetically.

Licences for GuitarSet and IDMT weren't confirmed (Zenodo is unreachable from the cloud container). Keep the audio out of the repo; score against a local copy with a script.

## Benchmark and tuning round (Oct 2026)

`npm run benchmark:chords` renders 47 chord shapes (open, sevenths, barres, power chords,
inversions, drop D, half-step down, DADGAD) with the Karplus-Strong strum synth, strums each
down and up, runs real Basic Pitch inference in Node, and scores the guitar pipeline. Basic
Pitch's output is cached under `benchmarks/results/cache/`, so tuning the post-processing
re-runs in seconds (`BENCHMARK_FRESH=1` re-runs the model). Cases live in
`benchmarks/chordCases.ts`.

| 94 strums | main before | after |
|---|---|---|
| Exact chord (notes, root and bass) | 78.7% | 95.7% |
| Right notes, bass ignored | 96.8% | 98.9% |
| Right shape (standard tuning only) | 60.0% | 68.8% |

What changed, and why:

- **Guitar range starts at D2 (MIDI 38).** It started at E2, which dropped the low string of
  drop D and half-step-down tunings and gave those chords the wrong bass.
- **Slash names win over "minor #5".** E G C is C/E, not Em#5; F# A D is D/F#, not F#m#5.
- **Guitar spelling.** Basic Pitch names notes with flats, so labels read Gbm and DM/Gb (which
  the label formatter then showed as plain "D Major"). Roots now use F#, C#, Eb, Ab, Bb and a
  chord-tone bass is spelled from the chord (D/F#).
- **Overtone ghosts are dropped when naming,** but only the strongest partials (octave,
  twelfth, double octave), only when under half the level of the note below, and only when no
  other note plays that pitch class. Looser rules stripped real chord tones: the F#4 in B7 is
  the twelfth of B2, and the F#4 in drop-D D lines up with D2's 5th harmonic.
- **Unheard octave doublings are cheap in the shape solver.** The top string of open G or A is
  often masked by the same note an octave below, so a known shape is no longer passed over for
  missing it.

Known limits, left for later:

- The synth's 98 Hz body mode adds a ghost G2 that turns Cadd9 into Cadd9/G. Real acoustic
  guitars have an air resonance near there too, so this may show up on real recordings.
- Several shapes share the same notes (G barre at 3 vs open G, C barre at 3 vs open C). Without
  string timbre the solver picks the more common open shape unless the progression says
  otherwise.
- The solver always assumes standard tuning. Passing the tuner's selected tuning through would
  fix shapes for alternate tunings.
- The cases are synthetic. GuitarSet or Guitar-TECHS recordings would test real playing.
