# Riff — Research Spike: Serverless, In-Browser Music App Architecture

> **Date:** 2026-03-08  
> **Scope:** Evaluate the current stack, compare to alternatives, audit cross-device audio concerns, and produce actionable recommendations for a fully server-free, installable guitar transcription tool.

---

## 1. What "Riff" Is

Riff is a single-page, server-free PWA that:

1. Captures raw microphone audio in the browser
2. Runs a neural-network pitch detector (Spotify's Basic Pitch) entirely client-side via TensorFlow.js
3. Converts detected MIDI events to note names and chords using the Tonal music-theory library
4. Displays a guitar-friendly note timeline, note chips, and chord name
5. Can play back the original recording (WAV) or a synthesized MIDI version (Web Audio oscillators)

No audio ever leaves the device. There is no account, no backend, and no subscription.

---

## 2. Current Stack — Annotated Inventory

| Layer | Technology | Version | Notes |
|---|---|---|---|
| UI framework | React | 19.2.4 | Latest stable, concurrent features available |
| Language | TypeScript | 5.9.3 | Strict mode, path aliasing via Vite |
| Bundler / dev server | Vite | 7.3.1 | ESM-native, fast HMR, Rollup for prod |
| Audio capture | Web Audio API — `ScriptProcessorNode` | Web platform | **Deprecated.** Runs on main thread. See §5 |
| Pitch detection | `@spotify/basic-pitch` | 1.0.1 | TF.js Layers model, polyphonic |
| ML runtime | `@tensorflow/tfjs` | 4.22.0 | WebGL backend; heavy bundle contributor |
| Music theory | `tonal` | 6.4.3 | Chord detection, MIDI↔note name |
| MIDI synthesis | Web Audio API — `OscillatorNode` | Web platform | Triangle-wave playback, no SoundFont |
| PWA shell | `manifest.json` | — | **No service worker registered yet** |
| Storage | None | — | Recordings are ephemeral (in-memory only) |

### Actual Build Sizes (production, Vite 7)

```
dist/assets/index.js       1,266 KB  (336 KB gzip)   ← main JS bundle
dist/assets/model.json       174 KB  (8.6 KB gzip)    ← TF.js model graph
[fetched at runtime]         728 KB                   ← model weights (.bin)
dist/assets/index.css          4 KB  (1.3 KB gzip)
```

**Total first-load payload (gzip):** ~346 KB JS + ~9 KB model graph + 728 KB weights ≈ **~1.1 MB transferred** on first load.

Key insight: the Basic Pitch model itself is only **~900 KB** (graph + weights combined). The JS bundle cost is dominated by `@tensorflow/tfjs` (WebGL backend + core), not the model graph.

---

## 3. The Serverless Thesis — Is It Sound?

### 3a. Why "no server" is the right target

| Goal | How the browser delivers it |
|---|---|
| Zero latency for inference | Runs on device GPU/CPU via WebGL/WASM |
| Privacy by default | Audio never leaves the device |
| Zero hosting cost | Static files on a CDN (Netlify, GitHub Pages, Cloudflare Pages) |
| Installable / offline | PWA service worker caches shell + model |
| Cross-platform (desktop + phone) | One codebase, any modern browser |

All of Riff's operations — recording, inference, playback — are 100% feasible with browser APIs alone. The serverless goal is architecturally valid.

### 3b. Comparable serverless music-tool architectures

| App / Project | Stack | Model delivery | Offline? |
|---|---|---|---|
| **Riff** (current) | React + TF.js + Basic Pitch | npm bundle + runtime fetch | Partial (no SW yet) |
| [Magenta Studio](https://magenta.tensorflow.org/studio) | Vanilla JS + TF.js + Magenta models | CDN + caching | No (requires CDN) |
| [ml5.js Pitch Detection](https://learn.ml5js.org/) | ml5 + CREPE/TFJS | CDN | No |
| [Tone.js](https://tonejs.github.io/) apps | Tone.js + Web Audio | Static | Yes (no ML) |
| [SoundSlice](https://www.soundslice.com/) | React + proprietary | Server-side | No |
| [Meyda](https://meyda.js.org/) | Vanilla JS, DSP only | npm | Yes (no ML) |
| [Piano Transcription (ONNX)](https://github.com/bytedance/piano_transcription) | ONNX Runtime Web | CDN | Possible |

Riff's approach is closest to the Magenta Studio pattern but smaller and more focused. The critical differentiator compared to server-based tools (SoundSlice, Moises, etc.) is that **inference is free, private, and offline-capable**.

---

## 4. ML Layer — Basic Pitch + TensorFlow.js Deep Dive

### What Basic Pitch does

Basic Pitch is a lightweight convolutional neural network trained by Spotify Research for **polyphonic automatic music transcription** (AMT). It predicts, for each short audio frame:
- note frame activations (is this pitch active?)
- note onset activations (did this pitch just start?)
- pitch contour (microtonal pitch bend)

It runs on 22,050 Hz mono audio and outputs a list of `NoteEventTime` objects (MIDI pitch, start, duration, amplitude).

### Model size reality check

```
model.json       900 KB total (graph + 1 weight shard)
  ├── model.json    172 KB  (layer graph, architecture)
  └── group1-shard1of1.bin  728 KB  (trained weights)
```

This is an exceptionally small model for polyphonic AMT. By comparison:
- Magenta's Onsets-and-Frames: ~80 MB
- piano_transcription (ONNX): ~130 MB
- CREPE (full): ~80 MB; CREPE Tiny: ~4 MB (monophonic only)

Basic Pitch at ~900 KB for polyphonic transcription is **the best available option** for this use case by a wide margin.

### TF.js is the real bundle problem

The model weights are tiny. The TF.js runtime itself is what inflates the bundle:

| Package | Gzip size (approx.) |
|---|---|
| `@tensorflow/tfjs-core` | ~160 KB |
| `@tensorflow/tfjs-backend-webgl` | ~120 KB |
| `@tensorflow/tfjs-backend-cpu` | ~50 KB |
| `@tensorflow/tfjs-layers` | ~30 KB |
| `@tensorflow/tfjs-converter` | ~25 KB |
| **Total TF.js (all backends)** | **~385 KB gzip** |

Of the current 336 KB gzip JS bundle, TF.js is the dominant contributor. Tonal (~10 KB) and React (~45 KB) are negligible by comparison.

### ML alternatives for pitch detection in the browser

| Option | Type | Bundle size | Polyphonic | Accuracy | Verdict |
|---|---|---|---|---|---|
| **Basic Pitch + TF.js** (current) | CNN (AMT) | ~385 KB runtime + 900 KB model | ✅ Yes | ⭐⭐⭐⭐⭐ | Best for this use case |
| Basic Pitch + **ONNX Runtime Web** | CNN (AMT) | ~110 KB runtime + ~900 KB model | ✅ Yes | ⭐⭐⭐⭐⭐ | ✅ Better bundle size |
| **CREPE** (TF.js) | CNN (pitch) | ~160 KB runtime + ~4 MB model | ❌ Monophonic | ⭐⭐⭐⭐ | Wrong tool for chords |
| **ml5.js pitchDetection** | CREPE wrapper | Large (bundles TF.js) | ❌ Monophonic | ⭐⭐⭐ | Too limited |
| **Meyda** (ACF/YIN) | DSP only | ~30 KB | ❌ Monophonic | ⭐⭐ | Zero-latency, no neural |
| **Pitchy** (McLeod) | DSP only | ~5 KB | ❌ Monophonic | ⭐⭐⭐ | Same, but smaller |
| Piano Transcription (ONNX) | Transformer | ~130 MB model | ✅ Yes | ⭐⭐⭐⭐⭐ | Way too large |
| **WebNN** (future) | Hardware API | N/A (OS-level) | Depends on model | — | Too early for production |

**Verdict on ML layer:** Basic Pitch is the right choice. The **only meaningful upgrade** is to explore running it via **ONNX Runtime Web** instead of TF.js, which could cut the JS runtime cost from ~385 KB to ~110 KB gzip — a ~275 KB savings. This is worth a dedicated spike but requires converting the `.pb` / `.h5` model to ONNX format.

### WebNN — watch but don't use yet

WebNN (W3C Candidate Recommendation as of 2026) enables hardware-accelerated inference using the device's NPU/GPU via OS-native backends (Core ML, DirectML, ONNX Runtime). Browser support as of 2026:

| Platform | CPU | GPU | NPU |
|---|---|---|---|
| Windows 11 (Edge/Chrome) | ✅ | ✅ (DirectML) | ✅ (Copilot+ PCs) |
| macOS 14.4+ (Edge/Chrome) | ✅ | ✅ (Core ML) | ✅ (Neural Engine) |
| iOS (Safari/Chrome) | ✅ | ❌ (default) | ❌ |
| Android (Chrome) | ✅ | ✅ (OpenCL) | Partial (NNAPI) |
| Firefox | ❌ | ❌ | ❌ |

WebNN is not yet usable for production on iOS Safari (the most constrained target). Monitor but don't implement now.

---

## 5. Audio Recording — The Most Critical Cross-Device Concern

### 5a. ScriptProcessorNode — must replace

The current implementation uses `ScriptProcessorNode`, which is:
- **Deprecated** in the Web Audio API spec (Level 2)
- Runs on the **main thread** → causes audio glitches under any UI load
- Will be removed from browsers at some point (Chrome has warned since 2019)

**Required migration:** `AudioWorkletNode` with an inline processor.

```
AudioContext
  └── createMediaStreamSource(stream)
        └── → AudioWorkletNode (PCM capture, off main thread)
              └── postMessage chunks to main thread → reassemble Float32Array
```

AudioWorklet browser support (2025):
- Chrome / Edge: ✅ (since 2018)
- Firefox: ✅ (since 2019)
- Safari / iOS Safari: ✅ (since iOS 14.5, April 2021)

> All actively-supported iOS devices (iPhone 6s and newer running iOS 15+) have full AudioWorklet support. The ScriptProcessorNode fallback is no longer needed for any realistic user base.

### 5b. Sample rate and resampling — iOS trap

Basic Pitch requires **22,050 Hz mono** input. The current code creates:

```ts
const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE }); // 22050
```

**On iOS Safari this will be silently ignored.** WebKit always uses the hardware sample rate (nearly always 44,100 Hz on iPhones). The actual context sample rate must be read from `audioContext.sampleRate` after creation and the captured buffer must be **resampled** to 22,050 Hz before passing to Basic Pitch.

Resampling options:
1. **`OfflineAudioContext` (recommended):** Create an `OfflineAudioContext` at 22,050 Hz, play the buffer through it, call `startRendering()`. Pure Web Audio API, zero extra dependencies, works everywhere.
2. **`AudioWorklet` with Speex or Lanczos resampler in WASM** — overkill for this use case.
3. **Polyfill libraries** (e.g., `audio-resampler`) — adds bundle weight, not needed when `OfflineAudioContext` works.

### 5c. Audio constraints — echoCancellation off is correct

The current `getUserMedia` constraints correctly disable `echoCancellation`, `noiseSuppression`, and `autoGainControl`. This is **essential** for musical pitch detection — these DSP filters destroy pitch-accuracy and tonal character.

Note: on iOS, some of these constraints may be silently re-enabled by the OS regardless. This is a known WebKit limitation with no workaround.

### 5d. MediaRecorder vs Web Audio API for capture

| | MediaRecorder | Web Audio API |
|---|---|---|
| Raw PCM access | ❌ | ✅ (required by Basic Pitch) |
| Cross-browser | ✅ | ✅ |
| Output format | WebM/Opus, MP4/AAC | Manual encode (WAV) |
| Complexity | Low | Medium |

Riff **must** use Web Audio API because Basic Pitch requires raw Float32 PCM. Using MediaRecorder would require decoding the compressed output back to PCM — adding a round-trip and complexity. The current approach is correct.

### 5e. Cross-device recording summary

| Device / Browser | getUserMedia | AudioWorklet | Sample rate override | Recommendation |
|---|---|---|---|---|
| Chrome desktop | ✅ | ✅ | ✅ (honored) | Full support |
| Firefox desktop | ✅ | ✅ | ✅ | Full support |
| Safari macOS | ✅ | ✅ | Partial | Works; check actual SR |
| Chrome Android | ✅ | ✅ | ✅ | Full support |
| Safari iOS 15+ | ✅ | ✅ | ❌ (ignored) | **Must resample after capture** |
| WKWebView (in-app) | ⚠️ | ✅ | ❌ | Requires `NSMicrophoneUsageDescription` |

---

## 6. PWA Completeness Audit

Riff has a `manifest.json` but **no service worker**, which means:
- It cannot be reliably installed on iOS ("Add to Home Screen" works but without offline support)
- The model weights (~900 KB) are re-downloaded on every session
- There is no offline fallback

### What a complete PWA needs

| Feature | Current state | Required action |
|---|---|---|
| Web App Manifest | ✅ Present | Add `maskable` icon variant |
| Service Worker | ❌ Missing | Add via `vite-plugin-pwa` |
| Offline shell caching | ❌ None | Workbox `generateSW` with `StaleWhileRevalidate` |
| Model weights caching | ❌ None | Cache `/assets/*.bin` and `model.json` via Workbox |
| Icons (192 + 512) | ⚠️ Referenced but files missing | Generate and add PNG icons |
| HTTPS | ✅ Required for getUserMedia | Provided by hosting platform |
| Background sync | N/A | Not needed for local-only app |

### Recommended: `vite-plugin-pwa`

`vite-plugin-pwa` integrates Workbox directly into the Vite build pipeline. Zero-config for basic cases, with full control over caching strategies:

```ts
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa'

VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,json,bin}'], // cache model weights
    runtimeCaching: [{
      urlPattern: /\.bin$/,
      handler: 'CacheFirst',
      options: { cacheName: 'model-weights', expiration: { maxEntries: 5 } }
    }]
  }
})
```

After the first load, the model weights and JS bundle will be served from the device cache — resulting in **sub-100ms load times** on repeat visits.

---

## 7. Storage — Recordings Are Currently Ephemeral

Right now, when a user navigates away, everything is lost. For a feature like "saved riff library" (already on the roadmap), the right storage tier is:

| API | Size limit | Sync | Use for |
|---|---|---|---|
| `localStorage` | ~5 MB | Sync | Settings, preferences only |
| **IndexedDB** | Hundreds of MB (quota-based) | Async | Note metadata, riff history, detected chords |
| **Origin Private File System (OPFS)** | Quota-based (GBs possible) | Sync in Worker | Raw audio recordings (Float32 blobs) |
| Cache API (via SW) | Quota-based | Async | ML model weights, static assets |

**Recommended storage architecture:**

```
IndexedDB (via `idb` library)
  ├── Store: "riffs"  → { id, name, timestamp, durationS, notes[], chord }
  └── Store: "settings" → { theme, audioConstraints }

OPFS (Origin Private File System)
  └── /riffs/{id}.f32  → raw Float32Array PCM (22050 Hz mono)
```

OPFS is now supported in all major browsers (Chrome 86+, Firefox 111+, Safari 15.2+) and is ideal for binary audio data because it allows synchronous file access from a Worker thread.

---

## 8. Bundle Optimization Roadmap

### Current bundle breakdown (gzip)

```
~336 KB  JS total
  ├── ~220 KB  @tensorflow/tfjs (runtime + backends)
  ├── ~45  KB  React + React-DOM
  ├── ~10  KB  tonal
  ├── ~10  KB  @spotify/basic-pitch (JS shim only)
  └── ~51  KB  App code, hooks, components
```

### Options, ranked by effort/impact

| Option | Bundle saving | Effort | Risk |
|---|---|---|---|
| **Code-split TF.js** (dynamic `import()`) | 0 KB saving, but deferred load | Low | Low |
| **Replace TF.js with ONNX Runtime Web** | ~275 KB gzip saving | High (model conversion required) | Medium |
| **TF.js custom bundle** (kernel subset) | ~50–100 KB saving | Medium | Medium |
| Switch to **tfjs-backend-wasm** only | Smaller, no WebGL dependency | Low | Low (perf may be slower) |
| **Lazy-load Basic Pitch** after first interaction | Perceived perf win on mobile | Low | Low |
| **Preload model on idle** (`requestIdleCallback`) | Faster first inference | Low | Low |

### Recommended quick wins

1. **Dynamic import Basic Pitch** — move `import('@spotify/basic-pitch')` into the `detect()` call. The model only loads when the user first stops recording. This cuts the initial JS parse cost significantly on mobile.

2. **Cache model on first load** — add `vite-plugin-pwa` with a `CacheFirst` strategy for `*.bin`. On second launch, inference starts instantly.

3. **Use `tfjs-backend-wasm`** as the inference backend instead of WebGL. The WASM backend is ~30% slower for this model but:
   - Has a smaller bundle footprint
   - Works in WebWorkers (unlike WebGL)
   - Is more reliable across headless/embedded contexts
   - Avoids WebGL context limit issues on mobile (max 8–16 contexts per page)

---

## 9. Performance Considerations

### Web Worker isolation

Currently, TF.js inference runs on the **main thread**, which blocks the UI during analysis. For recordings longer than ~3 seconds, this will cause visible jank.

**Recommended:** Move `usePitchDetection` into a `Worker`. The `evaluateModel()` call (and all TF.js operations) can run in a Worker since TF.js supports Worker contexts. The main thread sends the `Float32Array` via `postMessage` with `Transferable` semantics (zero-copy) and receives the note events back.

```
Main Thread                    Worker
    │                             │
    │──[Float32Array]──►          │
    │  (Transferable)        evaluateModel()
    │◄──[NoteEventTime[]]──       │
```

### OffscreenCanvas for the note timeline

The `PianoRoll` component currently uses DOM divs positioned with inline styles to render the note timeline. For large numbers of notes this is inefficient. An `OffscreenCanvas` approach (drawing directly in a Worker) would be faster but is an optimization for later — the current DOM approach is adequate for typical riff lengths (< 100 notes).

### AudioContext lifecycle

The current code creates a new `AudioContext` per recording session. `AudioContext` is a limited system resource. Best practice: create one context, keep it alive (use `ctx.suspend()` / `ctx.resume()`), and reuse it across sessions.

---

## 10. Comparison to Existing Tools and Stacks

### Riff vs server-based AMT tools

| | **Riff** | **Moises** | **AnthemScore** | **Sonic Visualiser** |
|---|---|---|---|---|
| Processing location | Client (browser) | Server | Desktop app | Desktop app |
| Privacy | ✅ No upload | ❌ Upload required | ✅ Local | ✅ Local |
| Cost | ✅ Free | ❌ Subscription | ❌ Paid | ✅ Free |
| Polyphonic AMT | ✅ | ✅ | ✅ | Plugins |
| Real-time | ❌ (post-record) | ❌ | ❌ | ❌ |
| Installable | ✅ PWA | ✅ App | ✅ App | ✅ App |
| Works offline | ⚠️ (no SW yet) | ❌ | ✅ | ✅ |

### Riff vs other in-browser audio tools

| | **Riff** | **Soundtrap** | **Chrome Music Lab** | **Flat.io** |
|---|---|---|---|---|
| Pitch detection | ✅ Neural | ❌ None | ✅ (simple) | ❌ None |
| No backend | ✅ | ❌ | ✅ | ❌ |
| Chord detection | ✅ | ❌ | ❌ | ❌ |
| Note timeline | ✅ | ✅ | ✅ | ✅ |

### Technology stack comparisons

#### Current stack vs alternative frameworks

| | **React 19** (current) | **Svelte 5** | **Solid.js** | **Vanilla + WASM** |
|---|---|---|---|---|
| Bundle size | ~45 KB gzip | ~15 KB | ~7 KB | 0 KB overhead |
| Reactivity | Virtual DOM (optimized) | Compiler-based | Fine-grained | Manual |
| Ecosystem | Enormous | Growing | Good | Minimal |
| TypeScript | ✅ First-class | ✅ | ✅ | ✅ |
| PWA support | Via plugins | Via plugins | Via plugins | Manual |
| Verdict | **Keep — overkill but safe** | Worth considering for v2 | Worth considering for v2 | Only if bundle is critical |

For a music tool that will grow a feature set (saved library, real-time display, settings), React's ecosystem benefits outweigh the bundle cost. React 19's concurrent features (Suspense, transitions) will become useful as inference moves to a Worker.

---

## 11. Verdict: Foundation Assessment

### ✅ What is solid

| Aspect | Assessment |
|---|---|
| No-server architecture | **Excellent.** 100% feasible and correct. |
| Basic Pitch for AMT | **Excellent.** Best-in-class for polyphonic pitch in-browser. Model is only 900 KB — much smaller than alternatives. |
| Tonal for music theory | **Excellent.** ~10 KB gzip, well-maintained, fully tree-shakeable. |
| React 19 + TypeScript + Vite | **Very Good.** Modern, fast, correct tooling. |
| PWA manifest | **Good foundation.** Just needs a service worker. |
| Privacy-first design | **Excellent.** Audio stays on device. |
| Audio constraint flags | **Correct.** Disabling AGC/echo cancellation is right for music. |

### ⚠️ What needs fixing (prioritized)

| Priority | Issue | Fix |
|---|---|---|
| 🔴 P0 | **`ScriptProcessorNode` is deprecated** | Migrate to `AudioWorkletNode` |
| 🔴 P0 | **No sample rate resampling** | Use `OfflineAudioContext` to resample to 22,050 Hz; iOS Safari always returns 44,100 Hz |
| 🟡 P1 | **No service worker** | Add `vite-plugin-pwa`; cache model weights for offline + fast repeat loads |
| 🟡 P1 | **TF.js inference on main thread** | Move `usePitchDetection` into a Web Worker |
| 🟡 P1 | **PWA icons referenced but missing** | Generate and add `icon-192.png` and `icon-512.png` |
| 🟠 P2 | **Recordings are ephemeral** | Add IndexedDB (via `idb`) for riff metadata; OPFS for raw audio |
| 🟠 P2 | **One `AudioContext` per session** | Persist a single context; suspend/resume between recordings |
| 🟢 P3 | **Bundle size** | Lazy-load Basic Pitch; evaluate ONNX Runtime Web migration |
| 🟢 P3 | **MIDI playback uses simple oscillators** | Explore SoundFont rendering via `WebAudioFont` or `Tone.js` sampler |

---

## 12. Recommended Path Forward

### Phase 1 — Fix the Foundation (P0 + P1)

1. **Replace `ScriptProcessorNode` with `AudioWorkletNode`**
   - Write an `audio-capture.worklet.js` processor that buffers PCM chunks and `postMessage`s them to the main thread
   - Use `addModule()` to register; the worklet file can be inlined via Vite's `?worker&url` import pattern

2. **Add OfflineAudioContext resampling**
   - After `stopRecording()`, check `audioContext.sampleRate`
   - If not 22,050 Hz, render through an `OfflineAudioContext(1, length * 22050 / actualSR, 22050)`
   - This is the correct, dependency-free approach

3. **Add `vite-plugin-pwa`**
   - Register a service worker with Workbox
   - Cache shell + all static assets + model weights with `CacheFirst`
   - Generate and commit real PWA icon PNGs

4. **Move inference to a Web Worker**
   - Create `src/workers/pitchDetection.worker.ts`
   - Expose a message API: `{ type: 'detect', audio: Float32Array }` → `{ type: 'result', notes: NoteEventTime[] }`
   - Pass `Float32Array` as a `Transferable` (zero-copy)

### Phase 2 — Persistence and UX (P2)

5. **Add `idb` and IndexedDB storage**
   - Schema: `{ id, name, timestamp, notes[], chord, durationS }`
   - Add a "Saved Riffs" panel to browse/replay history

6. **OPFS for audio**
   - Store raw PCM alongside each riff record for original audio playback after the session

### Phase 3 — Bundle and Performance (P3)

7. **Evaluate ONNX Runtime Web**
   - Convert the Basic Pitch `.h5` Keras model to ONNX with `tf2onnx`
   - Load via `onnxruntime-web` (~110 KB gzip vs ~385 KB for TF.js)
   - Estimated net saving: ~275 KB gzip (~50% reduction in JS transfer)

8. **Explore real-time display**
   - Use `requestAnimationFrame` + a rolling `AnalyserNode` for real-time VU/waveform while recording
   - Basic Pitch is not real-time (it processes after recording), but a live waveform gives feedback

---

## 13. Quick-Reference Dependency Table

| Dependency | Keep | Consider replacing | Reason |
|---|---|---|---|
| `react@19` | ✅ | — | Solid, ecosystem |
| `react-dom@19` | ✅ | — | Required |
| `@spotify/basic-pitch@1` | ✅ | ONNX version (future) | Best polyphonic AMT |
| `@tensorflow/tfjs@4` | ⚠️ | `onnxruntime-web` | Largest bundle cost |
| `tonal@6` | ✅ | — | Tiny, well-maintained |
| `vite@7` | ✅ | — | Best-in-class bundler |
| `vite-plugin-pwa` | ➕ Add | — | Needed for real PWA |
| `idb` | ➕ Add (future) | — | IndexedDB ergonomics |

---

## 14. Sources and References

- [Spotify Basic Pitch](https://github.com/spotify/basic-pitch) — model architecture and npm package
- [MDN: AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) — modern audio processing
- [MDN: OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext) — resampling
- [Can I Use: AudioWorklet](https://caniuse.com/mdn-api_audioworklet) — browser support
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) — alternative ML runtime
- [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) — service worker generation
- [tonaljs/tonal](https://github.com/tonaljs/tonal) — music theory library
- [WebNN W3C Spec](https://www.w3.org/TR/webnn/) — future hardware ML API
- [Origin Private File System (OPFS) — MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [RxDB: LocalStorage vs IndexedDB vs OPFS comparison](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html)
- [TF.js Size-Optimized Bundles](https://www.tensorflow.org/js/tutorials/deployment/size_optimized_bundles)
- [iOS Safari getUserMedia / AudioContext limitations](https://stackoverflow.com/questions/58132763) — WebKit bugs tracker
- [ZEGOCLOUD: Apple Safari WebRTC limitations](https://www.zegocloud.com/blog/apple-safari-webrtc)
