# Spike: App Audit — Performance, Workflow, Security, and React/TypeScript Quality

**Date:** 2026-03-10  
**Status:** Review complete

---

## Scope

Review the current app for:

- Performance opportunities
- Workflow and product-flow opportunities
- Security issues or abuse cases
- TypeScript and React best-practice gaps
- Priority buckets for suggested fixes
- A future-planned list for lower-priority improvements and refactors

Validation performed:

- `npm run test` — passing (104 tests)
- `npm run build` — passing
- Manual code review of recording, detection, playback, storage, import/export, and app shell

---

## Executive Summary

No critical XSS, injection, or credential-handling issues were found. The app is in generally good shape: tests pass, build passes, the architecture is coherent, and the hook/lib split is reasonable.

The main risks are:

1. **Silent failure paths** in pitch detection that can present operational errors as "no notes found."
2. **Client-side memory pressure** from importing large files and copying full PCM buffers before worker transfer.
3. **A stale-closure bug** around `profileId` that can produce incorrect timeline behavior after switching profiles.
4. **Bundle/runtime cost** that is acceptable for now but still heavy for mobile.

---

## Priority 1 — Fix Soon

### 1. Pitch-detection worker errors are converted into an empty-note success path

**Why it matters:** If the worker fails, the app resolves with `[]` instead of rejecting. That makes operational failure look like a valid "no notes detected" outcome. This is a workflow and debugging problem first, but it can also lead to user mistrust because the UI does not distinguish model failure from legitimate silence.

**Code:** [src/hooks/usePitchDetection.ts](src/hooks/usePitchDetection.ts#L99), [src/hooks/usePitchDetection.ts](src/hooks/usePitchDetection.ts#L104)

**Observed behavior:**
- On worker error, the hook sets an error string, but still resolves the pending request with an empty result.
- Upstream code can continue as though analysis succeeded.

**Suggested fix:**
- Reject the promise on worker error instead of resolving `[]`.
- In `useRiffSession`, handle the rejection explicitly and keep the previous analysis state intact.
- Add a regression test for worker failure that asserts the UI shows an analysis error rather than an empty success state.

---

### 2. Imported files are fully read into memory before duration limits are enforced

**Why it matters:** The import path trims by duration only **after** `file.arrayBuffer()` and full decode. A very large file can still cause memory spikes or tab instability before the 2-minute cap helps. This is the main security-adjacent issue in the app: client-side denial-of-service via oversized input.

**Code:** [src/lib/audioImport.ts](src/lib/audioImport.ts#L2), [src/lib/audioImport.ts](src/lib/audioImport.ts#L9)

**Observed behavior:**
- The app reads the full uploaded file into memory.
- Only after decode does it trim to the maximum duration.

**Suggested fix:**
- Add a hard file-size guard before `arrayBuffer()`.
- Surface a clear validation error for oversized imports.
- Consider separate limits for mobile and desktop if needed.

---

## Priority 2 — Important, but Not Blocking

### 3. `profileId` is captured stale in saved-riff and demo loaders

**Why it matters:** `handleLoadSavedRiff` and `handleLoadDemoAnalysis` both use `profileId` but omit it from their dependency arrays. If the user switches instrument profile, those callbacks can keep using an outdated profile-specific chord window. That produces incorrect or inconsistent timeline results.

**Code:** [src/hooks/useRiffSession.ts](src/hooks/useRiffSession.ts#L318), [src/hooks/useRiffSession.ts](src/hooks/useRiffSession.ts#L322), [src/hooks/useRiffSession.ts](src/hooks/useRiffSession.ts#L334), [src/hooks/useRiffSession.ts](src/hooks/useRiffSession.ts#L340)

**Suggested fix:**
- Add `profileId` to both callback dependency arrays.
- Add a hook test that switches profile, then loads a saved riff or demo take, and asserts the current profile’s chord window is applied.

---

### 4. Worker transfer currently duplicates the full audio buffer first

**Why it matters:** `audio.slice()` creates a full copy before transfer to the worker. For long clips, that means unnecessary memory overhead and copy time. It is not catastrophic at the current 2-minute limit, but it is avoidable and directly on the hot path.

**Code:** [src/hooks/usePitchDetection.ts](src/hooks/usePitchDetection.ts#L145)

**Suggested fix:**
- Rework ownership of the PCM buffer so the analysis path can transfer the original buffer when possible.
- If the buffer must remain available for playback/export, derive a more deliberate split earlier in the pipeline instead of copying in `detect()`.
- Add a benchmark or timing note for long imports before/after the change.

---

## Priority 3 — Worth Doing for Quality and Product Flow

### 5. MIDI sampler is initialized eagerly during `load()` even if playback never starts

**Why it matters:** This front-loads work and potentially sample loading at note-load time, even when the user never taps playback. It is a mild performance smell rather than a bug.

**Code:** [src/hooks/useMidiPlayback.ts](src/hooks/useMidiPlayback.ts#L63), [src/hooks/useMidiPlayback.ts](src/hooks/useMidiPlayback.ts#L80)

**Suggested fix:**
- Move sampler initialization fully behind `play()` / `previewNote()`.
- If perceived latency matters, preload on an explicit user interaction such as hover/focus/tap of the playback control.

---

### 6. Saved riffs are loaded as an unbounded list at startup

**Why it matters:** `listRiffs()` loads everything on mount. That is acceptable for a small personal library, but it will degrade over time and complicate future workflow improvements like search, sorting, and archive behavior.

**Code:** [src/hooks/useRiffSession.ts](src/hooks/useRiffSession.ts#L117)

**Suggested fix:**
- Add a limit for initial load, for example recent 20 or 50.
- Page or incrementally reveal older takes.
- Consider separate metadata summary reads if the store grows substantially.

---

## Security Notes

### What looks good

- No use of `dangerouslySetInnerHTML`, `eval`, or dynamic code execution was found.
- File export uses generated blobs rather than server round-trips.
- Audio capture relies on browser permission prompts and does not attempt background capture.
- Stored data remains client-side in IndexedDB/OPFS; there is no exposed backend surface in this app.

### Residual risk

- Oversized imports remain the main abuse path until file-size validation is added.
- Browser storage can accumulate indefinitely because there is currently no retention policy or deletion workflow.

---

## React and TypeScript Review

### What looks solid

- The app generally keeps React-free logic in `lib/` and orchestration in hooks.
- New lane work follows the same pattern instead of burying music logic in components.
- Types are mostly explicit and readable.
- Test coverage is strong relative to project size.

### Best-practice gaps

- `useRiffSession` is becoming a large orchestration hook with multiple responsibilities: recording flow, analysis flow, persistence, playback state coordination, and import/export concerns. It still works, but it is becoming the main pressure point for future changes.
- A few callbacks depend on values not present in their dependency arrays.
- Error handling in the worker path is too forgiving and should be made explicit.

---

## Performance Notes

Measured from the current production build:

- Main bundle: about **1.0 MB** uncompressed
- Worker bundle: about **1.0 MB** uncompressed
- Model weights: about **742 KB**

This is workable for a PWA, but still heavy for low-end mobile devices. The current architecture is already better than a main-thread inference path, but bundle pressure remains a real future concern.

---

## Future Planned List

These are worthwhile improvements, but they are not the highest-leverage fixes right now.

### Product / workflow

- Persist the selected lane (`Song` / `Chord`) in local storage so the app reopens in the user’s last mode.
- Add deletion, rename, and archive actions for saved riffs.
- Split `useRiffSession` into smaller hooks once the Chord lane grows real UI and substitution logic.
- Add a proper empty state for analysis failures distinct from "no notes detected."

### Performance

- Investigate bundle duplication between the main app and the pitch-detection worker.
- Lazy-load export code and/or playback sampler paths if usage data supports it.
- Consider a capped recent-riff query instead of full startup load.
- Add performance measurements for large import, analyze, and playback flows.

### Security / robustness

- Add a file-size limit before import decode.
- Add quota/error handling UX for IndexedDB and OPFS persistence failures.
- Add retention controls or cleanup for older stored audio blobs.

### React / TypeScript / maintainability

- Refactor `useRiffSession` into smaller hooks such as `useRiffAnalysis`, `useRiffPersistence`, and `useRiffImport` when the next lane phase lands.
- Tighten worker message typing so preload and detect requests have separate resolve/reject paths without casts.
- Add tests for profile switching and saved-riff reload behavior.

---

## Recommended Order

1. Fix worker error handling in [src/hooks/usePitchDetection.ts](src/hooks/usePitchDetection.ts).
2. Add import file-size validation in [src/lib/audioImport.ts](src/lib/audioImport.ts).
3. Fix stale `profileId` callback dependencies in [src/hooks/useRiffSession.ts](src/hooks/useRiffSession.ts).
4. Revisit PCM transfer/copy strategy in [src/hooks/usePitchDetection.ts](src/hooks/usePitchDetection.ts).
5. Defer broader refactors until after the Chord lane has a real fretboard implementation.
