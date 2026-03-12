# Spike: Guitar-First Playback and MIDI Sustain

## Problem

Riff already defaults its analysis profile to `guitar`, but the overall experience still does not feel guitar-first:

- the UI still offers a `Piano` profile
- in-app note preview uses a hardcoded piano sound
- exported MIDI does not declare a guitar program
- strummed chords often play back as short, disconnected note stabs instead of ringing out

The goal of this spike is to explain the current behavior and recommend how to make transcription, preview, and export sound more like guitar.

## Current state

### 1. The app is partly guitar-focused already

`src/hooks/useRiffSession.ts` defaults `profileId` to `guitar`, and `src/lib/instrumentProfiles.ts` constrains the guitar profile to a realistic guitar range (`40-88`), `maxPolyphony: 6`, and a small chord grouping window.

That is the right default for analysis, but the product still reads as multi-instrument because `src/components/Recorder.tsx` exposes `Default`, `Guitar`, and `Piano` equally in the primary recorder UI.

### 2. In-app preview is explicitly piano

`src/hooks/useMidiPlayback.ts` creates its sampler with:

```ts
new Soundfont(ctx, {
  instrument: "acoustic_grand_piano",
});
```

That means both full playback and note preview are rendered with a piano sound today.

This is the most obvious reason the app feels off for guitar users.

### 3. We do have note-length detection

The app does preserve note durations from Basic Pitch:

- `src/workers/pitchDetection.worker.ts` calls `outputToNotesPoly(...)` and `noteFramesToTime(...)`
- `src/hooks/usePitchDetection.ts` maps `durationSeconds` into `durationS`
- `src/lib/noteMapper.ts` preserves `durationS`
- `src/lib/audioExport.ts` exports note-off events using `startTimeS + durationS`

So the answer to "do we have length detection?" is: **yes, to a degree**. We already carry note lengths through the pipeline.

The bigger issue is that the current product does not always use or shape those durations in a guitar-friendly way.

### 4. Note preview throws duration away

The clickable note preview path in `src/App.tsx` calls:

```ts
midiPlayback.previewNote(note.midi, note.amplitude);
```

Then `src/hooks/useMidiPlayback.ts` plays that note with:

```ts
duration: 0.5
```

This is a fixed half-second preview for every note, regardless of the detected sustain.

So when someone clicks around the detected notes, they are not hearing the transcription faithfully. They are hearing short piano stabs.

### 5. Full playback uses detected duration, but Basic Pitch offsets still need help

`useMidiPlayback.play()` uses `duration: note.durationS`, which is better than the preview path. However, two limitations remain:

- Basic Pitch duration comes from frame/onset post-processing, not a guitar-specific sustain model
- for strummed chords, each string can get slightly different offsets, which makes the playback feel choppy even when the chord should ring together

This is why the transcription can technically contain duration data but still sound jolted.

### 6. MIDI export likely defaults to piano in external players

`src/lib/audioExport.ts` writes note-on and note-off events, but it does **not** emit a MIDI program change event.

In many MIDI players and DAWs, channel 0 without a program change defaults to Acoustic Grand Piano. So even if detection is correct, exported files can still sound piano-like unless the user manually changes the instrument.

## Root causes

There are really three different problems hiding under one complaint:

### A. Instrument identity is wrong

The product says "guitar," but playback defaults to piano in both internal preview and many external MIDI players.

### B. Preview is not faithful

The note-chip preview API only accepts `(midi, amplitude)` and hardcodes duration to `0.5s`. It is not previewing the detected note event.

### C. Sustained guitar behavior needs post-processing

Basic Pitch is providing note events, but guitar strums need extra shaping:

- grouped onset handling for strums
- shared or extended offsets for ringing chords
- smoother velocity and release behavior

Without that, a strummed chord becomes a cluster of separate note events that decay independently and often too abruptly.

## Recommendations

## Phase 1: make the app obviously guitar-first

These are the highest-value changes with the lowest implementation risk.

### 1. Remove or demote the piano toggle

Recommendation:

- keep `guitar` as the default and primary mode
- either remove `Piano` from the main recorder UI or move it behind an advanced/more profiles affordance
- consider renaming `Default` to something more specific, or remove it if guitar is the real product direction

If the app is for guitar, the main path should not ask the user to think about piano.

### 2. Default internal playback to a guitar patch

Recommendation:

- replace the hardcoded `"acoustic_grand_piano"` in `src/hooks/useMidiPlayback.ts`
- tie playback instrument selection to the active profile, or just make guitar the default unconditionally

At minimum, we should prefer an acoustic guitar patch if `smplr` supports it. If the available soundfont options are limited or not convincing, the next step would be evaluating a guitar-oriented sample source or a small custom sampler layer.

### 3. Emit a guitar program change in MIDI export

Recommendation:

- update `src/lib/audioExport.ts` to write a General MIDI program change near the start of the track
- default to an acoustic guitar program for exported files

That makes exported MIDI sound guitar-like in external players without forcing the user to reassign instruments manually.

## Phase 2: make preview and playback faithful to the detected performance

### 4. Change note preview to operate on a full note event, not just pitch

Recommendation:

- change `previewNote(midi, amplitude)` to accept a `MappedNote` or `{ midi, amplitude, durationS }`
- use the detected `durationS` in preview playback

This will immediately make clicked-note preview much less misleading.

### 5. Add a minimum guitar sustain floor

Recommendation:

- during playback, clamp very short detected notes upward for guitar mode
- for example, treat very short notes as `max(note.durationS, sustainFloorS)`

This is not a full solution, but it is a pragmatic improvement for ring-out perception, especially on simple chord previews.

### 6. Add a release tail for guitar playback

Recommendation:

- append a small release extension during playback, even if the MIDI note-off remains unchanged for export
- conceptually: `playbackDuration = note.durationS + releaseTailS`

This is a synthesis/playback concern rather than a transcription concern. It can make preview sound more natural without corrupting the exported note timing.

## Phase 3: improve transcription for strummed chords

This is the deeper fix for "I strummed a chord, but playback sounds like disconnected MIDI notes."

### 7. Group near-simultaneous onsets into a strum event

The current guitar profile already has `chordWindowS: 0.15`, which is a useful start for harmonic grouping. We can build on that.

Recommendation:

- detect note onsets that land within a short strum window
- treat them as belonging to one strum cluster
- preserve slight onset offsets for realism if desired, but share cluster-level sustain rules

This creates a better model for guitar than treating each detected note completely independently.

### 8. Unify or extend offsets within a chord cluster

Recommendation:

- for notes grouped into the same strum/chord cluster, compute a shared release target
- one simple approach is using the latest offset in the cluster as the release for all notes, or extending shorter notes toward that release

This is the clearest way to make a ringing strum stay together instead of collapsing into staggered dropouts.

### 9. Smooth velocities inside a strum

Recommendation:

- avoid large velocity jumps between notes that belong to the same chord
- optionally preserve a slight downstroke/upstroke shape, but keep the cluster coherent

This should make playback less percussive and less like a machine-gunned piano chord.

## Phase 4: deeper MIDI quality improvements

### 10. Add pitch-bend support later

Basic Pitch exposes contour data, and the broader Basic Pitch project supports pitch bends. That is not required for the first sustain fix, but it is the most promising way to capture guitar nuance like bends, vibrato, and slides later.

This is best treated as a later phase after the basics are fixed.

### 11. Consider duration post-processing from audio energy

Basic Pitch offsets are based on model activations. For guitar, perceived sustain often lasts longer than the strongest activation region.

Longer-term option:

- inspect local audio energy after onset
- extend offsets while note energy remains above a ring-out threshold

That is more complex than cluster-based duration smoothing, so it should come after the simpler chord-cluster fixes.

## Suggested implementation order

1. Make playback and export default to guitar.
2. Fix note preview so it uses detected duration.
3. Add a playback-only sustain floor and release tail in guitar mode.
4. Add chord-cluster duration smoothing for strummed playback.
5. Revisit export shaping after listening tests.
6. Evaluate pitch bends and energy-based offset extension later.

## Proposed success criteria

We should consider this spike successful if a follow-up implementation can achieve these outcomes:

- the primary UI reads as guitar-first
- in-app preview no longer sounds like piano by default
- exported MIDI opens with a guitar patch in standard players
- a simple open-chord strum rings out as one musical event rather than a stack of short note stabs
- note preview and full playback sound materially closer to each other

## Practical next step

The best first implementation slice is:

1. remove or demote the piano profile in the recorder UI
2. switch `useMidiPlayback` to a guitar patch
3. update note preview to use `durationS`
4. add a MIDI program change for acoustic guitar export
5. add a small guitar-only release tail during playback

That would not fully solve transcription quality, but it would immediately address the biggest mismatch between what the app claims to be and what it currently sounds like.

## External references

- [Spotify Engineering: Meet Basic Pitch](https://engineering.atspotify.com/2022/6/meet-basic-pitch)
- [Basic Pitch project site](https://basicpitch.spotify.com/about)
- [spotify/basic-pitch repository](https://github.com/spotify/basic-pitch)
