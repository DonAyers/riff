# Riff — TODO

> Consolidated from all research spikes. Items marked ✅ are shipped.  
> Phases are sequential — complete earlier phases before moving on.  
> See `research/` for detailed rationale behind each item.

---

## Phase 1 — Foundation (shipped)

- [x] Replace `ScriptProcessorNode` with `AudioWorkletNode` (P0)
- [x] Add `OfflineAudioContext` resampling for iOS Safari 44.1→22.05 kHz (P0)
- [x] Move TF.js inference to a Web Worker (P1)
- [x] Add `vite-plugin-pwa` + service worker + model weight caching (P1)
- [x] Persist a single `AudioContext` across record/stop cycles (P1)
- [x] Generate and add PWA icons (192, 512, maskable) (P1)

## Phase 2 — Persistence & Import (shipped)

- [x] Add IndexedDB storage for riff metadata via `idb` (P2)
- [x] Add OPFS storage for raw audio blobs (P2)
- [x] Audio file import (file picker → decode → resample → pipeline) (P2)
- [x] Compressed storage via native `MediaRecorder` — WebM/Opus or MP4/AAC (P2)
- [x] "Saved Riffs" panel with browse/open/delete (P2)

## Phase 3 — Responsive Layout (shipped)

- [x] Mobile-first single-column default layout
- [x] Desktop two-pane CSS Grid at 1280px+ breakpoint
- [x] Safe-area padding for notched devices
- [x] Empty-state analysis panel guidance on desktop
- [x] Playwright viewport-based layout regression test

---

## Current Focus — Guitar Lanes

> Product direction is now split into Song Lane and Chord Lane. This section tracks the active lane work separately from the older cross-app backlog below.

### Song Lane

- [x] Add explicit Song / Chord lane toggle
- [x] Default analysis to guitar profile
- [x] Detect probable key with relative-key fallback
- [x] Show chord timeline for multi-chord takes

### Chord Lane

- [x] Replace placeholder with seeded guitar fretboard rendering
- [x] Add phrase cycling across alternate seeded voicings
- [ ] Expand voicing coverage beyond the current common open/barre shapes
- [ ] Add variate suggestions backed by chord substitution rules

### Analysis Pipeline

- [x] Stop masking worker failures as empty-note results
- [x] Avoid full PCM copy before worker transfer
- [x] Restore audio buffer after worker success/error round-trip
- [ ] Verify there are no remaining avoidable PCM copies in persistence/export paths

### Validation

- [x] Add Vitest coverage for pitch-detection round-trip changes
- [x] Add Vitest coverage for fretboard rendering and voicing lookup
- [x] Add Playwright coverage for import → Chord lane → phrase cycling

---

## Phase 4 — Export

> **Goal:** Let users get their data out — into DAWs, onto other devices, shareable.

- [ ] Extract `encodeWav()` into shared `src/lib/audioExport.ts`
- [ ] "Download WAV" button (lossless, 16-bit, 22 kHz mono)
- [ ] MIDI file export — hand-roll SMF Type 0 encoder (~120 LOC, zero deps)
  - Converts `MappedNote[]` → `.mid` file with delta-time note on/off events
  - Default 120 BPM; optionally let user set BPM
- [ ] "Download native format" — offer the stored WebM/MP4 blob directly
- [ ] MP3 export via `@breezystack/lamejs` (+90 KB, 192 kbps default)
  - Run encoding in a Web Worker to avoid UI blocking
- [ ] Export UI — dropdown or panel with MIDI / WAV / MP3 options
  - Visible in analysis panel after detection completes

## Phase 5 — Cross-Browser Hardening

> **Goal:** Every browser and OS works reliably — no silent data loss.

- [ ] IndexedDB blob fallback when OPFS is unavailable (Firefox, Samsung Internet)
  - Audio currently lost on these browsers after save
- [ ] Verify `AudioContext.resume()` on MIDI play button (iOS Safari user-gesture requirement)
- [ ] Handle Web Worker termination under iOS memory pressure (save state, offer retry)
- [ ] Verify `Transferable` Float32Array in both directions (main→worker and worker→main)
- [ ] Surface storage format to user (e.g., "Saved as WebM/Opus" badge on riff cards)
- [ ] Prompt user to export/download important riffs (iOS Safari can evict storage)

## Phase 6 — Audio Quality

> **Goal:** Higher fidelity for playback and export without affecting analysis accuracy.

- [ ] Dual-rate capture: record at native 44.1/48 kHz, downsample to 22 kHz only for analysis
  - Gives full-fidelity playback and WAV export
  - Trade-off: ~2× PCM storage (compressed mode unaffected)
- [ ] 24-bit WAV export option for DAW users (vs current 16-bit)
- [ ] Optional peak normalization on audio export (normalize to −1 dBFS)
- [ ] Upsample to 44.1 kHz on WAV export for better DAW compatibility

## Phase 7 — Performance

> **Goal:** Smaller bundle, faster inference, snappier perceived speed.

### Bundle

- [ ] Evaluate ONNX Runtime Web as TF.js replacement
  - Convert Basic Pitch model to ONNX via `tf2onnx`
  - Expected savings: ~275 KB gzip (~385 KB → ~110 KB)
  - Bonus: WebGPU backend (faster on Chrome 113+), faster WASM fallback
- [ ] Lazy-load / code-split analysis components (`PianoRoll`, `NoteDisplay`, `ChordDisplay`)
  - Small byte savings but improves Time to Interactive

### Runtime

- [ ] Preload model on idle (`requestIdleCallback` → worker warmup message)
  - Eliminates 1-2 sec cold-start on first "Analyze" click
- [ ] Throttle pitch detection progress updates to ≤10/sec (every 2% or on completion)
- [ ] Verify old `Audio` elements are fully disposed (pause + remove listeners) on riff switch

### Perceived

- [ ] Skeleton/shimmer placeholders for piano roll and note display during analysis
- [ ] Optimistic save — write riff metadata to IndexedDB immediately on recording stop, update with notes after detection

## Phase 8 — UX & Features

> **Goal:** Polish and power-user features.

### Visualization

- [ ] Waveform display during/after recording (canvas-based, from AudioWorklet chunks or Float32Array)
- [ ] Playback position cursor on piano roll (synced via `requestAnimationFrame`)

### Intelligence

- [ ] Auto BPM detection from note onset timing (for MIDI export quantization)
  - Compute inter-onset intervals, cluster to find dominant beat
  - Fall back to 120 BPM for arrhythmic content

### Navigation

- [ ] Keyboard shortcuts
  - `Space` — start/stop recording
  - `P` — play/pause current take
  - `M` — play/pause MIDI preview
  - `A` — analyze (run pitch detection)
  - `E` — open export menu

### Sharing

- [ ] Share-via-URL — encode detected notes (MIDI + timing) as compact base64 URL payload
  - Visiting link plays MIDI representation; no file hosting needed
  - Consider paste-bin fallback for dense riffs (>50 notes may exceed URL limits)

### Theming

- [ ] Light/dark theme toggle (currently dark-only)

### Comparison

- [ ] Side-by-side riff comparison (overlay two piano rolls for practice progress tracking)

---

## Decision Log

Decisions made across spikes, preserved here for quick reference.

| Decision | Rationale | Spike |
|----------|-----------|-------|
| WebM/Opus for internal storage, MP3 for export | Opus is higher quality at same bitrate, zero deps; MP3 is universal for sharing | spike-improvements |
| Hand-roll MIDI exporter (no library) | SMF Type 0 is simple; `MappedNote[]` maps directly to events; avoids +8 KB dep | spike-improvements |
| `@breezystack/lamejs` for MP3 export | +90 KB, LGPL, pure JS, Worker-compatible; only alternative is WASM (heavier) | upload-and-format-spike |
| Analysis always runs on raw Float32 PCM | Never re-analyze from compressed storage — avoids lossy artifacts in detection | upload-and-format-spike |
| Keep React 19 | Ecosystem benefits outweigh ~30 KB premium over Svelte/Solid; concurrent features useful for Worker patterns | spike-architecture |
| ONNX Runtime Web is the next ML migration | ~275 KB gzip savings, WebGPU support, faster WASM; requires model conversion | spike-architecture |
| IndexedDB fallback for OPFS | Firefox/Samsung Internet don't support OPFS; IDB handles blobs fine under quota | spike-improvements |
| Single `AudioContext` per session | Avoids system resource limits; suspend/resume on record cycles | spike-architecture |
| 22,050 Hz for analysis, native rate for storage | Basic Pitch requires 22K; full-rate preserves playback/export quality | upload-and-format-spike |
