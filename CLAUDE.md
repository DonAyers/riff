# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Riff is a browser-based polyphonic music transcription tool. It records audio from the microphone, runs Spotify's Basic Pitch neural network entirely client-side (via TensorFlow.js in a Web Worker), and detects notes and chords. No backend, no accounts, no data leaves the device. Ships as a PWA.

## Commands

```bash
npm run dev              # Dev server at http://localhost:3000
npm run build            # TypeScript check + Vite build → dist/
npm run test             # Run Vitest once
npm run test:watch       # Run Vitest in watch mode
npm run test:coverage    # Coverage report (v8, HTML)
npm run test:e2e         # Run Playwright E2E tests
npm run release:check    # Validate release (test + build)
```

Run a single Vitest test file:
```bash
npx vitest run src/lib/chordDetector.test.ts
```

Run a single Playwright spec:
```bash
npx playwright test tests/e2e/smoke.spec.ts
```

## Testing Requirements (Non-Negotiable)

Every feature/fix must include tests at both layers:

1. **Vitest** — unit/integration for all changed lib/, hooks/, and components
2. **Playwright** — at least one happy-path E2E for every user-visible flow change

When fixing a bug: write a failing test first, then fix it. A PR missing tests is a merge blocker.

## Architecture

### Data Flow

```
Microphone / File Import
        ↓
useAudioRecorder (AudioWorklet + resampling)
        ↓
usePitchDetection → pitchDetection.worker.ts (TF.js / Basic Pitch, off-thread)
        ↓
noteMapper.ts → chordDetector.ts → filtered by instrumentProfiles.ts
        ↓
useRiffSession (central state machine — owns the whole pipeline)
        ↓
IndexedDB (metadata) + OPFS (PCM/compressed audio)
```

`useRiffSession` (`src/hooks/useRiffSession.ts`) is the orchestrator — it coordinates recording, detection, storage, and playback. Understand this hook before touching the pipeline.

### Key Architectural Decisions

- **Web Worker for inference:** `pitchDetection.worker.ts` runs TF.js off the main thread; communicates via Transferable `Float32Array` for zero-copy transfer.
- **AudioWorklet for capture:** Replaces deprecated `ScriptProcessorNode`; runs in a dedicated audio thread.
- **iOS resampling:** iOS Safari ignores sample-rate requests and always returns 44,100 Hz. After recording, if the actual sample rate ≠ 22,050 Hz, an `OfflineAudioContext` resamples before sending to the worker.
- **Storage:** IndexedDB (`idb`) for riff metadata; Origin Private File System (OPFS) for raw audio blobs.
- **Instrument profiles** (`src/lib/instrumentProfiles.ts`): Three profiles (Default, Guitar, Piano) parameterize MIDI range, amplitude threshold, polyphony limit, and chord-windowing. Profiles are applied after detection to filter `DetectedNote[]`.

### Module Map

| Path | Role |
|------|------|
| `src/hooks/useRiffSession.ts` | Central state machine — recording → detection → storage |
| `src/hooks/useAudioRecorder.ts` | Microphone capture, iOS resampling |
| `src/hooks/usePitchDetection.ts` | Dispatches audio to worker, tracks progress |
| `src/workers/pitchDetection.worker.ts` | TF.js + Basic Pitch inference (off-thread) |
| `src/lib/instrumentProfiles.ts` | Profile definitions and note filtering |
| `src/lib/noteMapper.ts` | MIDI → note name (C4, E4, …) |
| `src/lib/chordDetector.ts` | Pitch classes → chord name (via Tonal) |
| `src/lib/db.ts` | IndexedDB schema + CRUD |
| `src/lib/audioStorage.ts` | OPFS read/write |
| `src/lib/audioExport.ts` | WAV + MIDI export |

## Research & Docs Convention

All planning lives in `research/`:
- `spike-*.md` — exploratory, no commitment
- `plan-*.md` — decided work, source of truth
- `adr-*.md` — architecture decision records
- `plan.md` — main project roadmap

Do not create a `todo/` folder. Actionable tasks go in GitHub Issues.
