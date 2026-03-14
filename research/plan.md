# Riff — Actionable Development Plan

> Historical roadmap. For the focused product direction built around the two core user stories, use `research/plan-two-core-workflows.md` as the current planning doc.

> Derived from the architecture spike (2026-03-08).  
> Tasks are ordered by priority. Complete Phase 1 before moving to Phase 2.  
> Status last audited against the repo on 2026-03-13.

---

## Phase 1 — Fix the Foundation

These are P0/P1 blockers: correctness issues, a deprecated API, and the missing service worker.

---

### Task 1 · Replace `ScriptProcessorNode` with `AudioWorkletNode` `P0`

**Why:** `ScriptProcessorNode` is deprecated, runs on the main thread, and will eventually be removed from browsers.

**Steps:**
1. Create `src/worklets/audio-capture.worklet.ts`  
   — Implement a `AudioWorkletProcessor` subclass that buffers incoming PCM floats and `postMessage`s chunks back to the main thread.
2. Update `useAudioRecorder.ts`  
   — Register the worklet via `audioContext.audioWorklet.addModule(url)`.  
   — Replace `createScriptProcessor()` with `new AudioWorkletNode(ctx, 'audio-capture')`.  
   — Use Vite's `?worker&url` import to get the worklet URL at build time.
3. Delete any remaining `ScriptProcessorNode` references.

**Done when:** Recording works in Chrome, Firefox, and Safari without console deprecation warnings.

---

### Task 2 · Add `OfflineAudioContext` Resampling `P0`

**Why:** iOS Safari ignores the requested `sampleRate` and always returns 44,100 Hz. Basic Pitch requires 22,050 Hz mono. Without this, pitch detection is wrong on all iPhones.

**Steps:**
1. In `useAudioRecorder.ts`, after `stopRecording()`, read `audioContext.sampleRate`.
2. If it is not `22050`, resample:
   ```ts
   const offlineCtx = new OfflineAudioContext(1, Math.ceil(buffer.length * 22050 / actualSR), 22050);
   const source = offlineCtx.createBufferSource();
   source.buffer = buffer;
   source.connect(offlineCtx.destination);
   source.start();
   const resampled = await offlineCtx.startRendering();
   ```
3. Pass `resampled` (not the original buffer) to the pitch detector.

**Done when:** Detected notes are accurate on an iPhone (Safari, 44,100 Hz hardware).

---

### Task 3 · Move TF.js Inference to a Web Worker `P1`

**Why:** `evaluateModel()` blocks the main thread for several seconds on long recordings, freezing the UI.

**Steps:**
1. Create `src/workers/pitchDetection.worker.ts`.  
   — On `message` event `{ type: 'detect', audio: Float32Array }`:  
     load Basic Pitch lazily, run `evaluateModel()`, `postMessage` `{ type: 'result', notes }`.
2. Refactor `usePitchDetection.ts` to instantiate the worker and communicate via `postMessage` / `onmessage`.
3. Transfer the `Float32Array` as a `Transferable` (zero-copy):
   ```ts
   worker.postMessage({ type: 'detect', audio: pcm }, [pcm.buffer]);
   ```
4. Show a loading state in the UI while the worker is running.

**Done when:** The UI remains responsive during inference; long recordings (> 5 s) don't freeze the tab.

---

### Task 4 · Add `vite-plugin-pwa` and a Service Worker `P1`

**Why:** Without a service worker the app can't work offline, model weights are re-downloaded every session (~900 KB), and iOS "Add to Home Screen" installs are unreliable.

**Steps:**
1. Install: `npm install -D vite-plugin-pwa`
2. Add to `vite.config.ts`:
   ```ts
   import { VitePWA } from 'vite-plugin-pwa'

   VitePWA({
     registerType: 'autoUpdate',
     workbox: {
       globPatterns: ['**/*.{js,css,html,json,bin}'],
       runtimeCaching: [{
         urlPattern: /\.bin$/,
         handler: 'CacheFirst',
         options: { cacheName: 'model-weights', expiration: { maxEntries: 5 } }
       }]
     }
   })
   ```
3. Generate PWA icons and add to `public/`:
   - `icon-192.png` (192 × 192)
   - `icon-512.png` (512 × 512)
   - A `maskable` variant for Android adaptive icons
4. Update `public/manifest.json` to reference the new icons with `"purpose": "any maskable"`.

**Done when:** Lighthouse PWA audit passes; second load serves model from cache; app installs on iOS and Android.

---

### Task 5 · Persist a Single `AudioContext` `P1`

**Why:** Creating a new `AudioContext` per recording wastes a limited system resource and can cause errors on some platforms.

**Steps:**
1. Lift `AudioContext` creation out of the recording start handler.
2. Store it in a `useRef` (or module-level singleton).
3. Call `ctx.suspend()` when not recording; `ctx.resume()` when starting.

**Done when:** A single `AudioContext` instance is reused across multiple record/stop cycles without errors.

---

## Phase 2 — Persistence & UX

---

### Task 6 · Add IndexedDB Storage for Riff Metadata `P2`

**Why:** Recordings are currently lost on navigation. Users need a saved riff library.

**Steps:**
1. Install `idb`: `npm install idb`
2. Create `src/lib/db.ts` — define the schema and open the database:
   ```ts
   // Stores:
   // "riffs" → { id, name, timestamp, durationS, notes: NoteEventTime[], chord: string }
   // "settings" → { theme, audioConstraints }
   ```
3. After a successful detection, save the riff record to `"riffs"`.
4. Add a "Saved Riffs" UI panel that lists stored riffs and allows replay.

**Done when:** Riff metadata survives a page refresh and is browsable in the UI.

---

### Task 7 · Add OPFS Storage for Raw Audio `P2`

**Why:** IndexedDB is not ideal for large binary blobs. The Origin Private File System gives quota-managed, synchronous file access from a Worker.

**Steps:**
1. After stopping a recording, write the `Float32Array` PCM to OPFS:
   ```ts
   const root = await navigator.storage.getDirectory();
   const file = await root.getFileHandle(`riff-${id}.f32`, { create: true });
   const writable = await file.createWritable();
   await writable.write(pcm.buffer);
   await writable.close();
   ```
2. On playback, read the file from OPFS and reconstruct the audio buffer.
3. Link the OPFS filename in the IndexedDB riff record.

**Done when:** Original audio playback works after closing and reopening the app.

---

## Phase 3 — Bundle & Performance

---

### Task 8 · Lazy-Load Basic Pitch `P3`

**Why:** Parsing TF.js on startup adds significant main-thread time on mobile. The model is only needed after the first recording.

**Steps:**
1. In `pitchDetection.worker.ts`, use a dynamic import:
   ```ts
   const { BasicPitch } = await import('@spotify/basic-pitch');
   ```
2. This defers the ~385 KB TF.js parse until after first interaction.

**Done when:** Lighthouse "Time to Interactive" improves on a Moto G simulation.

---

### Task 9 · Evaluate ONNX Runtime Web as TF.js Replacement `P3`

**Why:** Replacing TF.js with `onnxruntime-web` could save ~275 KB gzip (~50% JS reduction).

**Steps:**
1. Convert the Basic Pitch Keras model to ONNX:
   ```bash
   pip install tf2onnx
   python -m tf2onnx.convert --saved-model ./basic_pitch_model --output basic_pitch.onnx
   ```
2. Install `onnxruntime-web`: `npm install onnxruntime-web`
3. Validate that inference output matches the TF.js output with the same audio input.
4. Replace `@tensorflow/tfjs` with `onnxruntime-web` in the worker.
5. Remove `@tensorflow/tfjs` from `package.json` if no longer needed.

**Done when:** Bundle gzip is ≤ 175 KB JS and inference accuracy is unchanged (validated against a reference recording).

---

### Task 10 · Improve MIDI Playback with Guitar SoundFont or Sampler `P3`

**Why:** The current triangle-wave oscillator playback sounds robotic. Guitar-oriented samples would be significantly more useful for verifying transcription in the product's guitar-first flow.

**Steps:**
1. Evaluate `WebAudioFont` (static SoundFont samples, no server) or `Tone.js` sampler.
2. Bundle a small acoustic guitar SoundFont or sampler patch that can cover the instrument range via pitch-shifting.
3. Replace oscillator playback in `useMidiPlayback.ts`.

**Done when:** MIDI playback uses guitar-oriented samples instead of oscillators.

---

## Summary Checklist

## Status Audit (2026-03-13)

- Tasks 2-8 are implemented in the current app and have supporting unit/integration coverage.
- Task 1 is functionally implemented via `AudioWorkletNode`, but a `ScriptProcessorNode` fallback still exists for compatibility. If the goal is to remove all deprecated API references, there is still cleanup to do.
- Task 9 has not been started. The pitch worker still relies on TF.js / Basic Pitch, and `onnxruntime-web` is not in the repo.
- Task 10 is implemented with sampler-based guitar playback rather than the original triangle-wave oscillator playback.

| # | Task | Priority | Status |
|---|---|---|---|
| 1 | Replace `ScriptProcessorNode` with `AudioWorkletNode` | 🔴 P0 | Done (worklet path shipped; compatibility fallback remains) |
| 2 | Add `OfflineAudioContext` resampling (iOS fix) | 🔴 P0 | Done |
| 3 | Move TF.js inference to a Web Worker | 🟡 P1 | Done |
| 4 | Add `vite-plugin-pwa` + service worker + icons | 🟡 P1 | Done |
| 5 | Persist a single `AudioContext` | 🟡 P1 | Done |
| 6 | IndexedDB riff metadata storage | 🟠 P2 | Done |
| 7 | OPFS raw audio storage | 🟠 P2 | Done |
| 8 | Lazy-load Basic Pitch | 🟢 P3 | Done |
| 9 | Evaluate ONNX Runtime Web | 🟢 P3 | Open |
| 10 | Better MIDI playback (SoundFont/sampler) | 🟢 P3 | Done |
