# TODO

> Single active backlog for the product. Historical shipped work and deeper rationale live in `research/`.

## Current focus — cleaner UX

- [x] Remove the lingering "guitar take" phrasing from the main landing flow.
- [x] Keep the primary flow obvious: capture first, review second.
- [x] Keep technical controls tucked behind `Advanced options`.
- [x] Keep a prominent live recording indicator visible while capture is active.
- [x] Do one more copy pass on the landing screen to remove any remaining jargon or duplicate labels.
- [x] Review the saved riffs list and export panel for the same "cleaner and more focused" treatment.
- [x] Decide whether the always-visible build badge belongs in the default UI or in a lighter-weight About surface.
- [x] Add calmer loading states for analysis surfaces so the experience feels less abrupt between capture and results.
- [x] Add ability for user to stop the piano roll from playing. Currently it seems like the user can hit play multiple times and it will even be playing overlapped as many times as they click
- [x] advanced options dropdown is to big and prominant. It can just be a cog wheel? Save smaller audio should just say "use compressed audio"

## Reliability and platform work

- [x] Add IndexedDB blob fallback when OPFS is unavailable (Firefox, Samsung Internet).
- [x] Verify `AudioContext.resume()` on MIDI playback for iOS Safari gesture requirements.
- [ ] Handle Web Worker termination under iOS memory pressure with a recoverable retry path.
- [ ] Verify `Transferable` `Float32Array` behavior in both directions (main thread to worker and back).
- [x] Surface saved audio format clearly on riff cards.
- [ ] Prompt users to export important riffs on browsers where storage eviction is likely.

## Audio quality and performance

- [ ] Capture at native sample rate for storage while downsampling only for analysis.
- [ ] Add optional 24-bit WAV export.
- [ ] Add optional peak normalization on export.
- [ ] Upsample WAV export to 44.1 kHz for better DAW compatibility.
- [ ] Evaluate ONNX Runtime Web as a future TF.js replacement.
- [ ] Lazy-load heavier analysis surfaces where it improves time to interactive.
- [x] Preload the model on idle to reduce first-analysis wait time.
- [x] Throttle analysis progress updates to reduce UI churn.
- [ ] Verify old audio elements are fully disposed when switching riffs.

## Feature backlog

- [ ] Add waveform display during and after recording.
- [x] Add a playback cursor / better play / stop controls to the piano roll.
- [ ] Add automatic BPM detection for tighter MIDI export.
- [ ] Add keyboard shortcuts for record, playback, analyze, and export actions.
- [ ] Add share-by-URL for note and timing data.
- [ ] Add a light theme.
- [ ] Add side-by-side riff comparison.
