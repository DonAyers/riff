# Spike: Looper metronome, grid and base-loop editing

Date: 2026-10-07

Exploratory. Builds on `plan-tuner-design-looper.md` (the 4-track looper shipped in PR #7). Nothing here is committed work until Don picks from the proposal at the end.

## Where the looper is today

Read from `src/hooks/useLooper.ts`, `src/lib/looper.ts` and `src/worklets/looper-capture.worklet.ts`.

- The first take is free length: the loop is exactly the frames between the two record presses (`finishFirstLoop`). There is no tempo or bar concept.
- Every track plays as a looping `AudioBufferSourceNode` started against one shared epoch on the `AudioContext` clock, so tracks stay sample-aligned. Buffers are created at the context's own sample rate, so looping never resamples.
- Overdubs start on the next loop boundary and record one full pass, shifted by the estimated round-trip latency plus the user nudge.
- Capture is sample-exact (worklet batches stamped with `currentFrame`). But chunks are pruned as soon as no take is active, so **no audio before the first press or after the closing press is kept**. That matters for trimming and extending (below).
- The first take is not latency-compensated. That is fine today, because both ends are presses and the shift cancels out. It stops being fine once there is a click to play against.

## Part 1: a metronome that stays on grid

### What the docs and tried-and-tested code say

- **Never time clicks with `setTimeout`/`setInterval`.** Main-thread timers drift by tens of ms under layout, rendering and GC. The standard pattern ("A Tale of Two Clocks", web.dev) is a coarse JS timer (about 25 ms) that schedules anything due in the next ~100 ms with `source.start(when)` on the `AudioContext` clock. Tone.js's Transport is the same design: `lookAhead` plus `updateInterval`, with the ticker in a Web Worker by default (`clockSource: "worker"`) so it keeps running in background tabs.
- **Chrome does not throttle background timers on a page that is playing audio** ("Applications playing audio are considered foreground"), so a looper that is looping is safe. iOS Safari still suspends audio when the screen locks; the looper already holds a wake lock.
- **Don't accumulate time** (`nextNoteTime += beat`). Compute beat *n* as `epoch + n * beatS` so floating-point error never builds up.
- **Draw the beat light from the audio clock, not from the scheduler.** Use `requestAnimationFrame` and subtract `outputLatency` (or use `getOutputTimestamp()`), otherwise the flash leads what you hear by the output latency. MDN now lists `outputLatency` as Baseline 2025, so the plan doc's "Safari has no `outputLatency`" is probably stale on current Safari; keep the zero fallback.

### The Riff-specific recommendation: the click is just another loop

Riff already has a sample-accurate scheduler: looping buffers started against a shared epoch. The simplest correct metronome is to **render one loop's worth of clicks into an `AudioBuffer` (same length in frames as the loop) and loop it like a track**, through its own gain node and never captured.

- Zero drift by construction. The click and the loops are the same kind of node on the same clock with the same length, so they can't slip relative to each other. A lookahead scheduler would need its beat period to divide the integer-frame loop length exactly; at 113 BPM and 48 kHz a beat is 25,486.7 frames, so a separately scheduled click slowly walks off a looping buffer.
- No main-thread timer at all while looping, so React renders and GC can't make it wobble.
- Tempo change means re-rendering the buffer (a few ms of `Float32Array` work) and restarting it at the current loop position, which `startPlayer` already does.
- Count-in: one extra bar, scheduled as a one-shot buffer that ends exactly at the epoch.
- Click sound: a synthesized 20 to 30 ms decaying sine burst written straight into the buffer (higher pitch on the downbeat). No samples to ship.

**Rule that keeps everything on grid:** once a loop exists, derive the beat from the loop's integer frame length (`beatFrames = loopFrames / beatsPerLoop`), never the other way round.

### Gotchas specific to a looper

1. **The first take must be latency-compensated once there's a click.** The player hears the click `outputLatency` late and their sound reaches the worklet `inputLatency` later. The overdub path already handles this with `estimateRoundTripLatencySeconds`; the first take needs the same shift when recorded on grid.
2. **Grid tightness is only as good as the latency estimate.** The latency auto-calibration follow-up from the last plan (play a click, hear it back through the mic, measure the offset) becomes important here. It only works with speakers on, so it's a one-time "calibrate" button, not automatic.
3. **The mic will record the click if you're on speakers.** `echoCancellation` is off on purpose (it mangles music), so nothing removes it. Options: recommend headphones (already done), and offer "click during count-in only".
4. **Bluetooth adds 150 to 250 ms** and reports it inconsistently; calibration is the only fix.

## Part 2: making the base loop "feel right"

Two different features hide behind "stretch":

| | Change the loop length | Time-stretch the audio |
|---|---|---|
| What it does | Moves the loop end (and start) so there's a bit more space or less | Speeds the audio up or down to fit a new length, pitch unchanged |
| Sounds like | The same playing, with a breath added or a late note cut | The same playing, slightly faster or slower |
| Cost | Small, pure buffer work in `lib/looper.ts` | A DSP library: `signalsmith-stretch` (MIT, ~230 KB, Web Audio node) is the best fit; `soundtouchjs` is LGPL |

Don's description ("add a tiny bit of extra space or trim it") is the first one. Recommend that now and keep time-stretch for later (it's the natural fit for "change the song's tempo after recording").

### How to build the length editor

- **Keep handles.** Keep ~2 s of audio before the first press and keep capturing ~2 s after the closing press. Trimming or extending then slides the loop window over real recorded audio (a ringing last chord stays, rather than being cut off). Past the handles, extending pads silence, which is the "tiny bit of extra space".
- **Edit end and start.** End handle = loop length. Start handle fixes a downbeat you hit a little late. Show both on the existing waveform, and add ±10 ms nudge buttons for fine control on a phone.
- **Seam:** replace the 4 ms edge fades with a short crossfade (10 to 20 ms) of the tail into the head when there's audio past the end; optionally snap edits to the nearest zero crossing.
- **Hear it live:** on each change rebuild the buffer from the stored take and restart the player at the same position. Only allow length edits while the base loop is the only track; once overdubs exist their length is locked (or they'd need padding and trimming too, which can come later).
- **Snap when there's a tempo:** with the metronome on, the handles snap to beats/bars.

### Where the two features meet: "fit tempo to loop"

What Loopy Pro, Ableton's Looper and the Boss RC series all do: play freely, then infer the tempo from the loop. Given a loop of L seconds and a bar count, BPM = bars × beatsPerBar × 60 / L. Pick the bar count (1, 2, 4, 8) that puts BPM in a sane range (about 70 to 160) and let the user tap ×2 / ÷2 to fix the guess. The click then joins in on the existing loop. This means Don can record first and add a grid after, instead of having to set a tempo up front.

The other direction (set BPM and bars first, record with a count-in, and the take auto-closes on the bar line) is the classic "loop quantize" mode and falls out of the same code.

## Other features worth having for song sketching

Seen across Loopy Pro, the Boss RC-505mkII (tap tempo, rhythm guide, "Mark Back" undo, reverse, fades), Ableton Looper (×2 / ÷2, speed, reverse, undo, feedback) and open-source web loopers:

- **Undo last take.** Keep the previous buffer for each track. Very cheap, high value.
- **Longer tracks as multiples of the base loop (×2, ×4).** A 2-bar groove under a 4-bar chord progression. This is what turns loops into song parts. Medium effort.
- **Export the mixdown as WAV** and **save/load looper sessions** (the existing `audioExport.ts`, IndexedDB and OPFS code). Already a follow-up from the last plan.
- **Detect chords on a loop.** Run the base loop through Riff's Basic Pitch pipeline and show the chord names. Nothing else does this, and Riff already has the whole pipeline.
- Reverse, half speed, overdub feedback/decay, song sections (A/B scenes): nice, lower priority.

## Proposal (prioritized)

1. **Loop length editor** for the base loop: pre/post-roll handles, end and start handles with nudge buttons, crossfaded seam, live preview, plus **undo last take**. Doesn't need a tempo; directly what Don asked for.
2. **Metronome and grid:** BPM + tap tempo, click as a looping buffer, count-in, beat light, "fit tempo to loop" with ×2 / ÷2, snap the editor to bars, first take latency-compensated.
3. **Latency calibration** (loopback click test). Makes item 2 feel tight.
4. **Song building:** ×2 / ×4 track lengths, WAV export, saved sessions, chords on a loop.
5. Later: time-stretch with `signalsmith-stretch`, reverse/half speed, scenes.

## Sources

- web.dev, "A tale of two clocks": https://web.dev/articles/audio-scheduling
- Tone.js `Context` options (`lookAhead`, `updateInterval`, `clockSource`): https://unpkg.com/tone@15.1.22/build/esm/core/context/Context.d.ts
- Chrome background timer throttling exemptions: https://developer.chrome.com/blog/background_tabs
- MDN `AudioContext.outputLatency`: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency
- Signalsmith Stretch (web): https://unpkg.com/signalsmith-stretch@1.3.2/README.md
- Sound On Sound, Boss RC-505mkII review: https://www.soundonsound.com/reviews/boss-rc-505-mkii

## Decision (2026-10-07)

Don picked item 1. Built as: 2 s pre/post-roll handles on the first take, start and end controls (±10 ms buttons and ±2 s sliders) shown only while the first take is the only track, a 10 ms equal-power seam crossfade, gapless player swaps while editing, and one level of undo for the last take. The metronome (item 2) is next.

## Item 2 built (2026-10-07)

Metronome and grid: a Click toggle, BPM (typed or tapped) and beats per bar. With the click on, a take starts after a one-bar count-in and closes on the nearest bar line, and it is shifted by the round-trip latency. The click is a looping buffer (one bar during the count-in, then the loop's length) started against the loop epoch. Bars are rounded to whole frames, so a recorded loop is an exact multiple of the bar. A loop played freely can "Fit tempo" (bar counts 1/2/4/8/16 aiming near 110 BPM within 70 to 160) with ×2 / ÷2 to fix the guess. On a grid the end edge snaps to whole beats and the start edge slides the downbeat. A beat light reads the audio clock minus output latency. Next: latency calibration (item 3).
