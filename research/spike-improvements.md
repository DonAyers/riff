# Riff — Improvement Recommendations Spike

> **Date:** 2026-03-09  
> **Status:** Research — no implementation commitment  
> **Scope:** Performance, cross-browser/OS hardening, format strategy (WebM-first/MP3-fallback), export capabilities (MIDI, high-quality audio), and general quality-of-life improvements.

---

## 1. Executive Summary

Riff is a well-architected MVP with solid foundations. This spike identifies concrete improvements across six pillars:

| # | Pillar | Impact | Effort |
|---|--------|--------|--------|
| A | **Format strategy** (WebM-first, MP3 fallback) | High | Medium |
| B | **Export capabilities** (MIDI file, WAV/MP3 download) | High | Medium |
| C | **Performance** (bundle, runtime, perceived speed) | Medium-High | Medium |
| D | **Cross-browser/OS hardening** | Medium | Low-Medium |
| E | **Audio quality & fidelity** | Medium | Low |
| F | **UX & general improvements** | Medium | Low-Medium |

---

## 2. Pillar A — Format Strategy: WebM-First, MP3 Fallback

### Current state

The app already uses `MediaRecorder` with a codec preference list:
1. `audio/webm;codecs=opus` (Chrome, Firefox)
2. `audio/mp4;codecs=aac` (Safari)
3. `audio/webm` (generic fallback)
4. `audio/ogg;codecs=opus`

This is good but can be improved with an explicit tiered strategy that prioritizes quality, then portability.

### Recommended codec priority

```
Tier 1 (best):    audio/webm;codecs=opus    — Chrome, Firefox, Edge, Android
Tier 2 (good):    audio/mp4;codecs=aac      — Safari, iOS Safari
Tier 3 (legacy):  audio/webm                — older Chrome/FF without Opus
Tier 4 (export):  MP3 via lamejs/WASM       — universal download format
Tier 5 (lossless):Raw PCM / WAV             — highest fidelity, large size
```

### Why WebM/Opus first

| Property | WebM/Opus | MP3 | AAC |
|----------|-----------|-----|-----|
| Quality at 96 kbps | Excellent | Fair | Good |
| Quality at 128 kbps | Transparent | Good | Very Good |
| Latency (encode) | Native (0 ms JS) | ~100 ms/sec (lamejs) | Native (0 ms JS) |
| Bundle cost | 0 KB (native API) | +90 KB (lamejs) | 0 KB (native API) |
| Patent status | Royalty-free | Licensed (but universal) | Licensed |
| Browser encode | Chrome ✅ FF ✅ Safari ❌ | JS library (all) | Safari ✅ Chrome ✅ |
| Browser decode/play | Chrome ✅ FF ✅ Safari 17+ | All ✅ | All ✅ |

**WebM/Opus wins for internal storage** — it's higher quality at the same bitrate, zero dependency, and royalty-free. The current code already does this. The gap is **export** — when a user wants to share or download a clip, MP3 or WAV is the universal format.

### Action items

1. **Keep current `MediaRecorder` strategy for internal storage** — already correct.
2. **Add MP3 export via `@breezystack/lamejs`** — for the "Download" / "Share" use case only (see Pillar B).
3. **Add WAV export** — already have `encodeWav()` in `useAudioPlayback.ts`; extract to a shared utility.
4. **Surface the internal format to users** as informational (e.g., "Saved as WebM/Opus" badge on riffs) so they understand what they're getting.

---

## 3. Pillar B — Export Capabilities

### Current state

- Riffs are stored locally (IndexedDB metadata + OPFS audio). No download/share/export.
- MIDI data exists in memory (`MappedNote[]` with MIDI numbers, timing, amplitude) but is not exportable.
- WAV encoding exists (`encodeWav()`) but is internal to playback.

### B1. MIDI File Export (Standard MIDI Format)

**Why:** Users who detect notes want to bring them into a DAW (Ableton, Logic, FL Studio, GarageBand). Standard MIDI File (SMF) is the universal interchange format.

**Approach — zero new dependencies:**

Standard MIDI File Type 0 (single track) is a simple binary format. A ~120-line encoder can produce valid `.mid` files without any library:

```
SMF structure:
  MThd (header chunk)  — 14 bytes fixed
  MTrk (track chunk)   — variable length
    ├── Tempo event (set BPM, or use default 120)
    ├── Note On events  (delta-time + 0x90 + pitch + velocity)
    ├── Note Off events (delta-time + 0x80 + pitch + 0)
    └── End of track (0xFF 0x2F 0x00)
```

**Implementation sketch:**

```ts
// src/lib/midiExport.ts

export function exportToMidi(notes: MappedNote[], bpm = 120): Blob {
  const ticksPerBeat = 480;
  const microsPerBeat = Math.round(60_000_000 / bpm);
  
  // Convert seconds → MIDI ticks
  const ticksPerSec = (ticksPerBeat * bpm) / 60;
  
  // Build events sorted by absolute tick
  const events: MidiEvent[] = [];
  for (const note of notes) {
    const startTick = Math.round(note.startTimeS * ticksPerSec);
    const endTick = Math.round((note.startTimeS + note.durationS) * ticksPerSec);
    const velocity = Math.max(1, Math.min(127, Math.round(note.amplitude * 127 * 3)));
    
    events.push({ tick: startTick, type: 'noteOn', pitch: note.midi, velocity });
    events.push({ tick: endTick, type: 'noteOff', pitch: note.midi, velocity: 0 });
  }
  
  events.sort((a, b) => a.tick - b.tick || (a.type === 'noteOff' ? -1 : 1));
  
  // Encode to binary (header + track with delta times)
  // ... ~80 lines of binary writing
  
  return new Blob([buffer], { type: 'audio/midi' });
}
```

**Alternatively — use a small library:**

| Library | Size (gzip) | Notes |
|---------|-------------|-------|
| `midi-writer-js` | ~8 KB | Clean API, well-maintained, MIT license |
| `jsmidgen` | ~5 KB | Older, simpler, MIT |
| Hand-rolled | 0 KB | ~120 LOC, no dependency, full control |

**Recommendation:** Hand-roll the SMF encoder. It's straightforward for Type 0 single-track, avoids a dependency, and the data model (`MappedNote[]`) maps directly to MIDI events. If multi-track or complex tempo maps are needed later, reconsider `midi-writer-js`.

**UX:**
- "Export MIDI" button in the analysis panel (visible after detection completes)
- Downloads a `.mid` file named after the riff (e.g., `Take-1435.mid`)
- Optional: Let user set BPM before export (default: auto-detect from note timing, or 120)

### B2. High-Quality Audio Export (WAV)

**Why:** Users want to share or archive their recordings in a universally playable format at full fidelity.

**Approach:**
- Extract `encodeWav()` from `useAudioPlayback.ts` into `src/lib/audioExport.ts`
- Add a "Download WAV" button that produces the raw 22,050 Hz / 16-bit PCM WAV
- Optionally upsample to 44,100 Hz for better compatibility with DAWs that expect CD-quality rate:
  ```ts
  const upsampled = await resample(pcm, 22050, 44100); // via OfflineAudioContext
  const wav = encodeWav(upsampled, 44100);
  ```

**File sizes (WAV at 44.1 kHz / 16-bit mono):**

| Duration | Size |
|----------|------|
| 5 sec | 430 KB |
| 10 sec | 860 KB |
| 30 sec | 2.6 MB |
| 60 sec | 5.2 MB |

Perfectly reasonable for download.

### B3. MP3 Export (Universal Sharing)

**Why:** WAV files are large and not streamable. MP3 is the lingua franca for sharing audio clips — every device, app, and platform can play it.

**Approach:**
- Add `@breezystack/lamejs` as a dependency (+90 KB gzip)
- Create `src/lib/mp3Export.ts` that encodes `Float32Array` → MP3 Blob
- Run encoding in a Web Worker to avoid blocking the UI
- Default: 192 kbps (high quality for short musical clips, ~24 KB/sec)

**Alternative — avoid the dependency entirely:**

If the internal format is already WebM/Opus or MP4/AAC, offer that blob as-is for download. Most modern devices can play both. Only add lamejs if MP3 specifically is required (e.g., for older device compatibility or email sharing).

### B4. Export UX Design

```
┌─────────────────────────────────────┐
│ Analysis Results                     │
│                                      │
│ Chord: C Major                       │
│ Notes: C4  E4  G4                    │
│ ┌────────────────────────────┐       │
│ │     Piano Roll             │       │
│ └────────────────────────────┘       │
│                                      │
│ ▶ Play Recording   ▶ Play MIDI      │
│                                      │
│ ┌─ Export ───────────────────┐       │
│ │ 📄 MIDI (.mid)            │       │
│ │ 🎵 WAV (lossless)         │       │
│ │ 🎵 MP3 (compressed)       │       │
│ └────────────────────────────┘       │
└─────────────────────────────────────┘
```

---

## 4. Pillar C — Performance

### C1. Bundle Size (~1.1 MB first load)

**Current breakdown (gzip):**

| Chunk | Size | Notes |
|-------|------|-------|
| TensorFlow.js | ~385 KB | Dominant contributor |
| React + ReactDOM | ~45 KB | Already lean (React 19) |
| Basic Pitch eval logic | ~15 KB | Inside worker |
| smplr (Soundfont) | ~25 KB | Lazy on first play |
| tonal | ~10 KB | Small |
| App code | ~20 KB | Small |
| Model graph + weights | ~908 KB | Cached by SW after first load |
| **Total transferred** | **~1.1 MB** | |

**Optimizations by priority:**

#### C1a. ONNX Runtime Web (replace TF.js) — saves ~275 KB

| | TensorFlow.js | ONNX Runtime Web |
|---|---|---|
| Bundle (gzip) | ~385 KB | ~110 KB |
| WebGL backend | ✅ | ✅ |
| WebGPU backend | Experimental | ✅ (superior) |
| WASM fallback | ✅ | ✅ (faster) |
| Model format | SavedModel / GraphModel | ONNX |

**Effort:** Medium. Requires converting the Basic Pitch TF SavedModel to ONNX format (via `tf2onnx` Python tool), then replacing the model loader in `basicPitchModel.ts`. The inference API is similar.

**Bonus:** ONNX Runtime's WebGPU backend is faster than TF.js's WebGL on devices with WebGPU support (Chrome 113+, Edge), and the WASM fallback is consistently faster than TF.js WASM.

#### C1b. Code-split the analysis panel — saves perceived load time

Currently everything loads in one chunk. The analysis components (PianoRoll, ChordDisplay, NoteDisplay) and the pitch detection worker are only needed after recording. Lazy-loading them would reduce the initial JS parse time:

```tsx
const PianoRoll = lazy(() => import('./components/PianoRoll'));
const NoteDisplay = lazy(() => import('./components/NoteDisplay'));
const ChordDisplay = lazy(() => import('./components/ChordDisplay'));
```

**Savings:** Small in absolute bytes (~10 KB), but improves Time to Interactive since the browser doesn't need to parse/compile analysis code until needed.

#### C1c. Preload the model graph on idle

Currently the model loads on first detection request. Consider preloading the model manifest (not the weights — those are cached by SW) during idle time after the page loads:

```ts
// In useRiffSession or App, after mount:
requestIdleCallback(() => {
  // Warm the worker — it will load TF.js + model graph
  pitchWorker.postMessage({ type: 'warmup' });
});
```

This eliminates the ~1-2 second cold-start delay on the first "Analyze" click.

### C2. Runtime Performance

#### C2a. Transferable Float32Arrays

The current code already uses `postMessage` to the worker, but verify that the audio buffer is transferred (zero-copy), not cloned:

```ts
// Good (zero-copy transfer):
worker.postMessage({ type: 'detect', audio: pcm }, [pcm.buffer]);

// Bad (full copy in both directions):
worker.postMessage({ type: 'detect', audio: pcm });
```

Check both directions — the worker should also transfer the result back.

#### C2b. Debounce/throttle progress updates

If the pitch detection worker sends progress events at very high frequency, consider throttling to ~10 updates/sec (every 100 ms) to reduce main-thread message processing overhead:

```ts
// In worker:
let lastProgress = 0;
function onProgress(pct: number) {
  if (pct - lastProgress >= 0.02 || pct >= 1) {  // Update every 2% or at completion
    postMessage({ type: 'progress', pct });
    lastProgress = pct;
  }
}
```

#### C2c. Audio element pooling

Each `load()` call in `useAudioPlayback` creates a new `Audio()` element and blob URL. If users flip through riffs quickly, this can leak blob URLs and audio elements. The current code does revoke the previous URL — good. Verify that the old `Audio` element is also properly disposed (pause + remove event listeners).

### C3. Perceived Performance

#### C3a. Skeleton/shimmer states

Show lightweight skeleton placeholders for the piano roll and note display regions while analysis is running, rather than just a progress bar. This signals to the user that content is coming.

#### C3b. Optimistic save

Save the riff metadata to IndexedDB immediately when recording stops (before analysis completes). Update the record with notes/chord once detection finishes. This way the "Recent takes" list updates instantly.

---

## 5. Pillar D — Cross-Browser / Cross-OS Hardening

### D1. Comprehensive browser support matrix

| Feature | Chrome 90+ | Firefox 90+ | Safari 15.4+ | iOS Safari 15.4+ | Samsung Internet | Notes |
|---------|-----------|------------|-------------|-----------------|-----------------|-------|
| AudioWorklet | ✅ | ✅ | ✅ | ✅ | ✅ | Fallback: ScriptProcessor ✅ |
| OfflineAudioContext | ✅ | ✅ | ✅ | ✅ | ✅ | |
| MediaRecorder | ✅ | ✅ | ✅ (14.3+) | ✅ (14.3+) | ✅ | |
| WebM/Opus encode | ✅ | ✅ | ❌ | ❌ | ✅ | Safari → MP4/AAC fallback |
| WebM/Opus decode | ✅ | ✅ | ✅ (17+) | ✅ (17+) | ✅ | |
| OPFS | ✅ | ❌ | ✅ (17+) | ✅ (17+) | ❌ | Fallback needed |
| IndexedDB | ✅ | ✅ | ✅ | ✅ | ✅ | |
| WebGPU | ✅ (113+) | ❌ | ❌ | ❌ | ❌ | TF.js/ONNX acceleration |
| WebGL 2 | ✅ | ✅ | ✅ (15+) | ✅ (15+) | ✅ | TF.js primary backend |
| Service Worker | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Web Worker | ✅ | ✅ | ✅ | ✅ | ✅ | |

### D2. OPFS fallback strategy

OPFS is only available in Chrome (and Safari 17+). Firefox and Samsung Internet don't support it. Currently the code returns `false` when OPFS is unavailable — this means riffs lose their audio on Firefox.

**Recommendation:** Add IndexedDB blob storage as a fallback:

```ts
// audioStorage.ts — add fallback path

async function saveAudioBlob(fileName: string, blob: Blob): Promise<boolean> {
  // Try OPFS first
  if (await saveToOpfs(fileName, blob)) return true;
  // Fallback: store blob in IndexedDB
  return saveToIndexedDB(fileName, blob);
}
```

IndexedDB can store blobs up to browser quota (typically 50-80% of free disk space). This eliminates the Firefox/Samsung Internet gap entirely.

### D3. iOS Safari specific hardening

1. **AudioContext resume on user gesture:** iOS Safari requires a user gesture to start an AudioContext. The recorder likely handles this (recording starts on button click), but verify that MIDI playback also resumes the AudioContext on the play button click.

2. **Memory pressure:** iOS Safari aggressively reclaims memory from background tabs. If inference is running and the user switches apps, the worker may be killed. Consider:
   - Saving intermediate state before inference starts
   - Detecting worker termination and offering a retry
   
3. **`getUserMedia` constraints:** iOS Safari may silently re-enable `echoCancellation` and `noiseSuppression`. Document this limitation and consider adding a visual indicator when these constraints are overridden.

4. **Storage eviction:** iOS Safari can evict OPFS and IndexedDB data under storage pressure. For important riffs, prompt the user to export/download.

### D4. Firefox-specific

1. **OPFS unavailable** → implement IndexedDB fallback (D2 above)
2. **WebM/Opus:** Firefox supports it natively — no issues
3. **TF.js WebGL:** Works, but can be slower than Chrome due to different ANGLE backend. ONNX WASM fallback may actually be faster on Firefox.

### D5. Samsung Internet / other Chromium

Generally follows Chrome's capabilities. Test with actual device if possible; Samsung Internet sometimes lags Chrome by a few versions on API support.

---

## 6. Pillar E — Audio Quality & Fidelity

### E1. Recording sample rate

Currently downsampled to 22,050 Hz for Basic Pitch. This is correct for analysis but limits playback quality (Nyquist frequency = 11 kHz — not full range).

**Recommendation — dual-rate capture:**

1. **Store at native rate** (44,100 or 48,000 Hz) for playback and export
2. **Downsample to 22,050 Hz** only for the pitch detection pipeline

```ts
// During recording:
const recordingSampleRate = audioContext.sampleRate; // 44100 or 48000
const rawPcm = /* captured at native rate */;

// For analysis:
const downsampledPcm = await resample(rawPcm, recordingSampleRate, 22050);
pitchWorker.postMessage({ audio: downsampledPcm }, [downsampledPcm.buffer]);

// For storage/playback:
const blob = await encodeCompressed(rawPcm, recordingSampleRate);
```

This gives full-fidelity playback and export while keeping pitch detection accurate.

**Trade-off:** ~2× storage for PCM mode (88 KB/sec → 176 KB/sec). Compressed mode impact is minimal since codec bitrate, not sample rate, drives file size.

### E2. Bit depth

Current WAV export is 16-bit. For "high-quality export," offer 24-bit WAV:

```ts
function encodeWav24(samples: Float32Array, sampleRate: number): Blob {
  // 24-bit PCM: 3 bytes per sample instead of 2
  // Better dynamic range (144 dB vs 96 dB)
}
```

This matters for users importing into DAWs where 24-bit is the standard working format.

### E3. Normalize on export

Offer optional loudness normalization on audio export (peak normalize to -1 dBFS). This ensures exported clips are at a consistent, usable volume:

```ts
function normalize(pcm: Float32Array): Float32Array {
  const peak = pcm.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
  if (peak === 0 || peak > 0.95) return pcm; // Already normalized or silent
  const gain = 0.95 / peak;
  return pcm.map(s => s * gain);
}
```

---

## 7. Pillar F — UX & General Improvements

### F1. Waveform visualization

Add a waveform display during/after recording. This gives visual feedback that audio is being captured and helps users identify silent sections:

- During recording: real-time waveform (render from AudioWorklet chunks)
- After recording: static waveform of the full clip (rendered from Float32Array)
- Can be lightweight — canvas-based, 2-3 KB of code

### F2. Playback position indicator on piano roll

Sync a vertical playhead line on the PianoRoll with audio playback position. Users can see which notes are playing in real time. Requires:
- `requestAnimationFrame` loop during playback
- `audioElement.currentTime` or manual timer for MIDI playback
- CSS transform for the playhead position (GPU-accelerated)

### F3. Tempo/BPM detection

Before MIDI export, auto-detect tempo from note onset timing. This makes the exported MIDI file quantized and usable in a DAW without manual BPM alignment:

```ts
function detectBPM(notes: MappedNote[]): number {
  // Compute inter-onset intervals (IOIs) between consecutive note starts
  // Find the most common IOI cluster
  // Map to BPM range (60-200)
}
```

Simple onset-based BPM detection works well for rhythmic riffs. Fall back to 120 BPM for arrhythmic/ambient content.

### F4. Riff comparison / history

Allow users to compare two riffs side-by-side (e.g., "Practice take 1" vs "Practice take 5"). Show overlapping piano rolls or diff the note lists. Useful for tracking practice progress.

### F5. Share via URL

Generate a shareable link that encodes the riff's notes (not audio — too large). The URL could encode:
- Detected notes (MIDI + timing) as a compact base64 payload
- Chord name
- BPM

Visiting the link plays back the MIDI representation. This is a lightweight "share" that doesn't require file hosting.

### F6. Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Start/stop recording |
| `P` | Play/pause current take |
| `M` | Play/pause MIDI preview |
| `A` | Analyze (run pitch detection) |
| `E` | Open export menu |
| `1-9` | Quick-load recent riff |

### F7. Dark/light theme toggle

Currently dark-only. Adding a light theme improves usability in bright environments and is an accessibility accommodation for users with certain visual preferences.

---

## 8. Recommended Implementation Order

### Phase 1 — High-impact, low-risk (ship next)

| # | Item | Pillar | Effort |
|---|------|--------|--------|
| 1 | IndexedDB fallback for OPFS (Firefox support) | D2 | Small |
| 2 | Extract `encodeWav` to shared `audioExport.ts` | B2 | Small |
| 3 | MIDI file export (hand-rolled SMF encoder) | B1 | Medium |
| 4 | "Download WAV" button | B2 | Small |
| 5 | Worker model warmup on idle | C1c | Small |
| 6 | Verify Transferable usage both directions | C2a | Small |

### Phase 2 — Quality & polish

| # | Item | Pillar | Effort |
|---|------|--------|--------|
| 7 | Dual-rate capture (native for playback, 22K for analysis) | E1 | Medium |
| 8 | MP3 export via lamejs | B3 | Medium |
| 9 | Waveform visualization | F1 | Medium |
| 10 | Playback position on piano roll | F2 | Medium |
| 11 | 24-bit WAV export option | E2 | Small |
| 12 | Skeleton states during analysis | C3a | Small |

### Phase 3 — Major perf wins

| # | Item | Pillar | Effort |
|---|------|--------|--------|
| 13 | ONNX Runtime Web migration (replace TF.js) | C1a | Large |
| 14 | Tempo/BPM auto-detection | F3 | Medium |
| 15 | Code-split analysis components | C1b | Small |
| 16 | Share-via-URL (MIDI payload) | F5 | Medium |

---

## 9. Format Decision Matrix (for reference)

When to use each format:

| Scenario | Format | Rationale |
|----------|--------|-----------|
| **Internal storage (Chrome/FF/Edge)** | WebM/Opus | Native, zero deps, best quality/size |
| **Internal storage (Safari/iOS)** | MP4/AAC | Only native option |
| **Internal storage (OPFS unavailable)** | IndexedDB blob | Universal fallback |
| **Export for DAW** | WAV (44.1 kHz, 16 or 24-bit) | Universal, lossless |
| **Export for sharing** | MP3 (192 kbps) | Universal, small, every device plays it |
| **Export for DAW (notes)** | MIDI (.mid) | Universal note interchange |
| **Pitch detection** | Float32 @ 22,050 Hz | Required by Basic Pitch |

---

## 10. Open Questions

1. **ONNX model conversion** — Has anyone published a Basic Pitch ONNX model, or do we need to convert ourselves? (Check Spotify's GitHub for ONNX artifacts.)
2. **MP3 export priority** — Is the lamejs dependency (+90 KB) justified, or is offering the native WebM/MP4 blob for download sufficient for v1?
3. **BPM detection accuracy** — For non-rhythmic content (sustained chords, ambient textures), BPM detection is meaningless. Should we skip it and default to 120 BPM in the MIDI export?
4. **Dual-rate recording** — The 2× PCM storage cost is a concern for the lossless storage mode. Is the quality improvement worth it given most users will use compressed storage?
5. **Share-via-URL payload size** — A dense riff with 50+ notes might produce a URL that exceeds some platform limits (~2 KB). Consider a paste-bin style API if sharing becomes a priority feature.
