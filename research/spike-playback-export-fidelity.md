# Spike: Playback And Export Fidelity

> Date: 2026-03-13  
> Status: Research - recommendation ready  
> Scope: Improve trust in playback and choose the right DAW handoff formats.

---

## Goal

Make the app feel musically trustworthy when it plays back detections and when the user exports results into other tools.

---

## Core Question

### Is MIDI still the right DAW handoff in 2026?

Yes.

For this app, `MIDI` should remain the primary DAW import/export format because it is still the most practical way to move detected notes into Ableton, Logic, FL Studio, GarageBand, and similar tools.

The real issue is not the format. The issue is that detected note timing, duration, velocity, and preview shaping still need work.

---

## Recommended Export Stack

### Now

- `MIDI` - primary note-data export for DAWs
- `WAV` or equivalent audio export - reference audio for listening and alignment

### Later

- `MusicXML` - if notation-oriented workflows become important

### Not now

- DAW-specific project export
- exotic interchange formats that do not materially improve the first two workflows

---

## Why Playback Feels Wrong Today

There are three main causes:

1. **Detection data is too raw for direct preview.**  
   Small pitch flicker, note fragmentation, and unstable amplitudes become audible immediately.
2. **Velocity mapping is not calibrated enough.**  
   Browser playback exaggerates weak or uneven dynamics.
3. **Preview aims for literal note playback instead of useful musical confirmation.**  
   The app should preserve truth, but still shape playback enough to sound believable.

---

## Recommendation

### Separate raw detection from preview shaping

Keep raw note events for analysis/export, but add playback-only shaping rules:

- minimum duration floor
- velocity smoothing
- note overlap cleanup
- guitar strum cluster smoothing
- optional instrument-specific release tail

This improves trust without corrupting exported note data.

---

## Settings The Product Needs

### Input presets

- `Voice / humming`
- `Single-note riff`
- `Guitar chord / section`

### Advanced controls

- sensitivity
- minimum note length
- noise filtering
- dynamics smoothing
- maybe a "cleaner notation/playback" toggle later

These settings matter more than adding more raw analysis panels.

---

## Preview Strategy

### Melody workflow

- optimize for clear, accurate monophonic preview
- do not over-chase realism at the expense of confirming pitch and rhythm

### Guitar workflow

- optimize for coherent chord/strum playback
- use voicing-aware duration and release shaping
- do not try to fake a full physical guitar model yet

---

## Export Strategy

### MIDI

Keep this as the default export for note data.

Needs:

- clean note-on/note-off timing
- calibrated velocity mapping
- instrument/program defaults where useful

### Audio

Keep audio export next to MIDI so users can compare the reference recording with the note export.

### MusicXML

Research later if the notation workflow becomes important enough that users want notation-native import/export.

---

## Open Research Questions

1. Should displayed notation/playback be rhythm-quantized separately from MIDI export?
2. How much dynamics smoothing is enough before playback becomes misleading?
3. Do we need separate export profiles for melody versus guitar?
4. Is pitch-bend handling worth adding after the core note/chord workflows are stable?

---

## Decision

- Keep `MIDI` as the main DAW handoff format.
- Improve playback by shaping preview separately from raw detection.
- Add input presets and sensitivity controls before chasing more advanced export formats.
- Treat `MusicXML` as a later follow-up, not a blocker to making the core workflows strong.
