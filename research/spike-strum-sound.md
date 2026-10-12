# Spike: Strummed Chord Sound

> Date: 2026-10-12
> Status: Research + prototype (branch `claude/strum-sound-spike-fan7zk`)
> Scope: Tapping a chord shape or a string should sound like a guitar being strummed or picked.

---

## Question

Can Riff play a convincing strum when you tap a chord or a string, and what should make the sound: samples or a tiny synth?

## How sound works today

- `useMidiPlayback` plays detected notes through **smplr `Soundfont`** with `acoustic_guitar_steel`. smplr's default kit is **MusyngKite**, fetched at runtime from `https://gleitz.github.io/midi-js-soundfonts/MusyngKite/acoustic_guitar_steel-mp3.js` (1.84 MB of base64 MP3 inside a JS file; FluidR3_GM's is 1.89 MB).
- Tapping a note chip calls `previewNote`, which plays one sampled note.
- The chord shape diagrams (`ChordFretboard`, used in the Shape screen, the chord map and the chord sheet) make **no sound at all**. Nothing plays a chord as a guitar would: the voicing's actual frets, low to high, a few milliseconds apart.

### Gotchas found in the current sample path

1. **Not offline.** The PWA's Workbox config only caches same-origin `assets/*.bin|json`. The soundfont comes from `gleitz.github.io`, so playback silently fails offline and on networks that block GitHub Pages (this cloud sandbox's proxy blocks it too).
2. **Licence.** MusyngKite is CC BY-SA 3.0, which needs attribution in the app. FluidR3_GM (`kit: "FluidR3_GM"`) is MIT.
3. **Cost on first tap.** ~1.8 MB download plus base64 decode and `decodeAudioData` for 88 notes before the first sound. On a phone that is a visible delay the first time.
4. **One velocity layer, one sample per note.** General MIDI guitar samples sound like a keyboard playing guitar notes; the "strum" quality comes from timing, which smplr leaves to the caller.

## What makes a strum convincing

Mostly timing and voicing, then timbre:

- Play the **voicing's real strings** (e.g. C = x32010 → C3 E3 G3 C4 E4), not root-position chord tones.
- **Stagger the strings** 10–15 ms apart, low to high on a down strum, high to low on an up strum, with a little jitter.
- **Taper velocity** across the strum, and make up strums lighter.
- **Choke**: a new strum stops the strings that are still ringing; re-picking one string stops only that string.
- Lower strings ring longer than high ones; muted strings make no sound.

These apply to either sound source, so the prototype puts them in one place (`strumOffsets`, `strumPlayer`).

## Options

| Option | Download | Offline | Sound | Notes |
|---|---|---|---|---|
| **A. Tiny Karplus-Strong synth** (prototype) | +2.7 KB gzip (measured), no samples | Yes | Convincing plucked steel string; a bit "synthetic" on single high notes, good on strums | Renders a strum in ~5 ms into an `AudioBuffer`; deterministic, testable |
| B. Keep smplr Soundfont (MusyngKite) | 1.84 MB from a third-party CDN | No (today) | GM-sample guitar, one layer | Already shipped; needs attribution; first-tap delay |
| C. Self-hosted small sample set | ~300–600 KB if trimmed to MIDI 40–76 and pitch-shifted every 2–3 semitones | Yes, with Workbox precache | Best realism if the source is good | Needs a clean licence (FluidR3 = MIT); smplr `Sampler` can play it |
| D. Real-time KS in an `AudioWorklet` | Small | Yes | Same as A | Only worth it for bends, vibrato, hold-to-sustain. More moving parts (worklet module loading, the `?worker&url` import gotcha the looper hit) |
| E. Tone.js `PluckSynth` | Tone.js is a large dependency | Yes | Basic KS without tuning correction or body | Not worth adding a second audio framework |

## Prototype (option A)

- `src/lib/pluckSynth.ts`: Karplus-Strong with the Jaffe & Smith (1983) extensions:
  - first-order **allpass fine tuning**, so every note is within 0.1 cent (unit-tested at 44.1 and 48 kHz). Plain KS rounds the delay and drifts several cents sharp on high notes.
  - **pitch-aware decay** (the loop gain is set from a target T60; low strings ring longer).
  - **pick position** comb on the excitation, and a **dynamics** low-pass that makes soft picks darker.
  - three band-pass **body resonances** (~98, 204 and 390 Hz) for the wooden-body warmth.
  - seeded noise, so renders are repeatable and testable.
- `src/lib/strumPlayer.ts`: one shared `AudioContext` (`latencyHint: "interactive"`), created and resumed inside the tap so iOS unlocks audio; LRU cache of rendered buffers; chokes with a 12 ms fade; sets `navigator.audioSession.type = "playback"` when it is still `"auto"`, so the iPhone silent switch does not mute it (it leaves the looper's `"play-and-record"` alone).
- `src/components/StrumPad.tsx`: under every fretboard diagram, **Strum ↓**, **Strum ↑**, six string buttons labelled with their notes (muted strings disabled), and a **Synth / Sampled** switch that plays the same strum timing through the current smplr soundfont for an A/B.

Rendered listening samples (44.1 kHz WAV) are in the project files under `sound/listen/`.

## iOS and mobile notes

- **Silent switch:** Web Audio defaults to the "ambient" session and is muted by the ring/silent switch; `navigator.audioSession.type = "playback"` (Safari 16.4+) fixes it. Don't set it while recording: the looper uses `"play-and-record"`.
- **Unlock:** create/resume the `AudioContext` synchronously in the tap handler, not after an `await`.
- **Sample rate:** iOS runs at 44.1 or 48 kHz regardless of what you ask for; the synth renders at `context.sampleRate`, so it stays in tune either way.
- **Number of contexts:** iOS limits concurrent `AudioContext`s, so the strum player shares one context across all fretboards.
- **Tap latency:** `touch-action: manipulation` on the buttons removes the double-tap-zoom delay; buffer playback starts 5 ms after the tap.

## Recommendation

1. **Ship option A for chord and string taps.** It is the only option that is instant, offline and free of licence and download questions, and the strum mechanics matter more than sample realism for a 2-second preview.
2. **A/B it against the sampled sound on a real phone** with the prototype's switch. If the synth wins, drop the switch, and consider moving the MIDI timeline preview onto the same synth so the app has one guitar voice and no CDN dependency.
3. If the samples win, do **option C**, not B: self-host a trimmed FluidR3 (MIT) steel-guitar set in `public/`, precache it with Workbox, and feed it to smplr's `Sampler` through the same `strumPlayer` API.
4. Only build the `AudioWorklet` version (D) if a feature needs live control of a ringing string (hold to sustain, bends, palm mute).

## Sources

- Jaffe & Smith, "Extensions of the Karplus-Strong plucked-string algorithm", *Computer Music Journal* 7(2), 1983; summary: https://theory.stanford.edu/~blynn/sound/karplusstrong.html
- AudioWorklet KS reference: https://github.com/jackschaedler/karplus-stress-tester
- iOS silent switch and `navigator.audioSession`: https://bugs.webkit.org/show_bug.cgi?id=251532, https://adactio.com/tags/audiosession
- smplr soundfont URLs and kits: `node_modules/smplr/dist/index.mjs` (`gleitzKitUrl`, `SOUNDFONT_KITS`)
- Soundfont file sizes: https://github.com/gleitz/midi-js-soundfonts (MusyngKite and FluidR3_GM `acoustic_guitar_steel-mp3.js`)
