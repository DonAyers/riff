# Riff — Enhancement Spike: Audio Upload + Recording Format Selection

> **Date:** 2026-03-09  
> **Status:** Phase 1 (Import) shipped. Phase 2 (Compressed storage) shipped.  
> **Scope:** Add file import pathway alongside mic recording; evaluate compressed storage formats; assess format compatibility with Basic Pitch and Tonal.

---

## 1. Executive Summary

Two enhancements are proposed:

1. **Audio Upload/Import** — ✅ **Shipped.** Let users file-pick an audio file (MP3, WAV, FLAC, OGG, etc.) as an alternative to mic recording. The file's decoded PCM feeds into the existing analysis pipeline identically to a mic recording.

2. **Compressed Storage** — ✅ **Shipped.** Users can toggle "Compress saved audio" to store riffs as WebM/Opus (Chrome/Firefox) or MP4/AAC (Safari) instead of raw Float32 PCM — **zero new dependencies**, using the browser's native `MediaRecorder`. ~82% space savings.

Both features converge on the same architectural question: **what format does the analysis pipeline actually need?**

---

## 2. What the Pipeline Actually Requires

### Basic Pitch (pitch detection)

- **Input:** `Float32Array` at **22,050 Hz mono**
- It does not accept MP3, WAV, or any encoded format directly
- All audio must be decoded to raw PCM before inference

### Tonal (chord detection)

- **Input:** `string[]` of pitch class names (e.g., `["C", "E", "G"]`)
- Tonal never touches audio at all — it receives the *output* of Basic Pitch via `noteMapper.ts`
- **Format-agnostic.** No impact from any recording format change.

### Key insight

> The analysis pipeline always needs raw Float32 PCM at 22,050 Hz. The *storage* and *source* format is irrelevant as long as we decode to PCM before analysis. MP3, WAV, FLAC, OGG — all of these can be decoded to Float32Array via the Web Audio API's `decodeAudioData()`.

---

## 3. Feature 1: Audio File Upload/Import

### 3a. Design

Record remains the primary action. Import is a secondary entry point — a small "Import" button or drop zone alongside the record button.

**User flow:**
```
[Record]  [Import file]
              │
              ├── File picker opens (accept: audio/*)
              │   OR drag-and-drop
              │
              ▼
     Read file as ArrayBuffer
              │
              ▼
     AudioContext.decodeAudioData(buffer)
              │
              ▼
     Resample to 22050 Hz mono (OfflineAudioContext)
              │
              ▼
     Float32Array → existing pipeline
     (identical path as mic recording from this point)
```

### 3b. Supported import formats (free via `decodeAudioData`)

The Web Audio API's `decodeAudioData()` handles all formats the browser's media decoder supports. No extra libraries needed.

| Format | Chrome | Firefox | Safari | Notes |
|--------|--------|---------|--------|-------|
| WAV (PCM) | ✅ | ✅ | ✅ | Lossless, large files |
| MP3 | ✅ | ✅ | ✅ | Most common user format |
| AAC / M4A | ✅ | ⚠️ Partial | ✅ | iOS voice memos are M4A |
| OGG Vorbis | ✅ | ✅ | ❌ | Safari doesn't decode OGG |
| FLAC | ✅ | ✅ | ✅ | Lossless, smaller than WAV |
| WebM/Opus | ✅ | ✅ | ⚠️ Safari 17+ | Common for web recordings |

For broad compatibility, accept `audio/*` and let the browser handle it. If decoding fails, show a user-friendly error.

### 3c. Implementation plan

**New hook: `useAudioImport`**

```ts
export function useAudioImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFile = useCallback(async (file: File): Promise<Float32Array | null> => {
    setIsImporting(true);
    setError(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
      // Take first channel (mono)
      const channelData = decodedBuffer.getChannelData(0);
      // Resample to 22050 Hz
      const resampled = await resampleToTarget(channelData, decodedBuffer.sampleRate);
      await audioContext.close();
      return resampled;
    } catch {
      setError("Could not decode this audio file. Try WAV, MP3, or FLAC.");
      return null;
    } finally {
      setIsImporting(false);
    }
  }, []);

  return { importFile, isImporting, error };
}
```

**Changes to `useRiffSession`:**
- Add a `handleImport(file: File)` that calls `importFile()`, then feeds the resulting `Float32Array` into the same path as `handleStop` (load into playback, set `hasRecording`, optionally auto-analyze).
- The rest of the pipeline is untouched.

**UI changes:**
- Add an "Import" button next to the record button (secondary styling)
- Optionally support drag-and-drop on the main area
- Import button disabled while recording is active

### 3d. Effort estimate

| Task | Scope |
|------|-------|
| `useAudioImport` hook | ~50 lines, new file |
| Wire into `useRiffSession` | ~20 lines changed |
| Import button in `Recorder.tsx` | ~30 lines changed |
| Tests (unit + e2e with fixture file) | ~100 lines |
| **Total** | **Small — half-day feature** |

---

## 4. Feature 2: Recording Format Selection (MP3)

### 4a. Current storage cost

Recordings are stored as raw Float32 PCM at 22,050 Hz in OPFS:

```
Size = duration_seconds × 22050 samples/sec × 4 bytes/sample
     = duration × 88,200 bytes/sec
     ≈ 88 KB/sec
     ≈ 5.3 MB/min
```

A 10-second riff = **~860 KB**. A 30-second clip = **~2.6 MB**.

### 4b. MP3 storage savings

At 128 kbps MP3 (good quality for music):

```
Size = duration × 16,000 bytes/sec = 16 KB/sec ≈ 960 KB/min
```

| Duration | Raw Float32 | MP3 128kbps | Savings |
|----------|-------------|-------------|---------|
| 5 sec | 430 KB | 80 KB | **82%** |
| 10 sec | 860 KB | 160 KB | **81%** |
| 30 sec | 2.6 MB | 480 KB | **82%** |
| 60 sec | 5.3 MB | 960 KB | **82%** |

~5× space reduction. Significant for a library of saved riffs.

### 4c. MP3 encoding in the browser — options

There is **no native browser API** for MP3 encoding. You must use a JavaScript/WASM library.

| Library | Size (gzip) | Speed | License | Notes |
|---------|-------------|-------|---------|-------|
| **lamejs** | ~90 KB | Moderate (JS) | LGPL-2.1 | Pure JS port of LAME. Most popular. Works in Workers. |
| **@breezystack/lamejs** | ~90 KB | Moderate (JS) | LGPL-2.1 | Maintained fork of lamejs with TS types |
| **vmsg** | ~150 KB | Fast (WASM) | MIT + LGPL | WASM-compiled LAME. Better perf, heavier. |
| **ffmpeg.wasm** | ~25 MB | Fast (WASM) | LGPL | Full FFmpeg. Massive overkill. |
| **MediaRecorder** (native) | 0 KB | Native | — | Can record to WebM/Opus or MP4/AAC, **not MP3** |

**Recommended: `lamejs`** (or the better-maintained `@breezystack/lamejs`)
- ~90 KB gzip is acceptable
- Pure JS, runs in Web Workers
- Widely used, battle-tested
- LGPL license is fine for client-side web apps (no linking/distribution concerns)

### 4d. Architecture for format selection

```
User chooses format: [PCM (lossless)] [MP3 (space saver)]
                                         │
Recording pipeline (unchanged):          │
  Mic → AudioWorklet → Float32Array      │
         at 22050 Hz                     │
              │                          │
              ▼                          │
    ┌─────────────────────┐              │
    │ Analysis pipeline   │ ◄── Always uses Float32Array
    │ (Basic Pitch/Tonal) │     Format choice doesn't affect this
    └─────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ Storage encoding    │ ◄── Format choice affects THIS step only
    │                     │
    │ if PCM:             │
    │   savePcmToOpfs()   │  (current behavior)
    │                     │
    │ if MP3:             │
    │   encode(lamejs)    │
    │   saveMp3ToOpfs()   │
    └─────────────────────┘
```

**Critical design point:** The format choice affects **storage only**, not analysis. The Float32Array is always generated first, fed to Basic Pitch, and *then* encoded for storage. This means:

- **No quality loss for analysis.** Basic Pitch always gets the raw PCM.
- **Lossy compression only affects playback fidelity** of the stored recording.
- **On restore from storage**, an MP3 file would need to be decoded back to Float32Array for playback (via `decodeAudioData`), adding a small decode step.

### 4e. Downsides of MP3 recording

| Concern | Severity | Detail |
|---------|----------|--------|
| **Lossy compression artifacts** | Low | At 128+ kbps, virtually inaudible for short musical riffs. At 64 kbps, noticeable on pitched tones. |
| **Encoding time** | Low | lamejs encodes ~10× realtime on modern hardware. A 10-sec clip encodes in ~1 sec. Can run in a Worker. |
| **Bundle size increase** | Low | +90 KB gzip for lamejs. Acceptable given TF.js is already ~385 KB. |
| **LGPL license** | Negligible | Client-side JS — no binary distribution concerns. |
| **Re-analysis from stored MP3** | Medium | If a user re-analyzes a stored MP3 riff, they'd get slightly different results vs. original PCM. MP3 compression introduces subtle spectral artifacts that *can* affect pitch detection on quiet or harmonically complex passages. **Mitigation:** always analyze from the original PCM capture (before encoding), never from the stored MP3. |
| **Playback quality** | Low | MP3 128kbps is perceptually transparent for most listeners on short clips. |
| **Restore-to-playback latency** | Negligible | `decodeAudioData` for a 30-sec MP3 takes <50ms. |

### 4f. Will MP3 "work with" Tonal and Basic Pitch?

**Tonal:** Yes, trivially. Tonal never sees audio — it only receives note names from the mapper.

**Basic Pitch:** It will never see the MP3 directly. The pipeline is:
1. Record → Float32Array (raw)
2. Analyze Float32Array with Basic Pitch → notes
3. *Then* encode Float32Array to MP3 for storage

If you later need to re-analyze from a *stored* MP3:
1. Decode MP3 → Float32Array (via `decodeAudioData`)
2. Feed decoded Float32Array to Basic Pitch

This works, but with a caveat: **MP3 encoding/decoding is not bit-perfect.** The decoded PCM will differ slightly from the original. For typical musical content at 128+ kbps, the difference is negligible and Basic Pitch results will be effectively identical. At very low bitrates (64 kbps or below), you may see occasional missed notes on quiet harmonics.

**Recommendation:** Default to 128 kbps if offering MP3. This provides an 82% space saving with no practical quality impact on analysis.

### 4g. Alternative: Store as OGG/Opus via MediaRecorder (zero dependencies)

Instead of adding lamejs, consider:

- Use `MediaRecorder` with `mimeType: 'audio/webm;codecs=opus'` to get compressed audio for free
- Store the compressed blob in OPFS
- For playback: use as-is (browsers play WebM/Opus natively)
- For re-analysis: decode via `decodeAudioData` → Float32Array

| | MP3 (lamejs) | WebM/Opus (MediaRecorder) |
|---|---|---|
| Extra dependency | +90 KB | None |
| Quality at same bitrate | Good | Better (Opus > MP3) |
| Browser encoding support | All (JS lib) | Chrome ✅, Firefox ✅, Safari ⚠️ (no Opus) |
| Safari compatibility | ✅ | ❌ (Safari only does MP4/AAC) |
| Universal playback | ✅ | ❌ (Safari issues) |

**Verdict:** MP3 via lamejs is the safer choice for cross-browser compatibility, especially since Safari/iOS is a key target for a music app. But if Safari support isn't critical short-term, WebM/Opus via MediaRecorder is zero-dependency.

### 4h. Hybrid approach (recommended)

A pragmatic middle ground:

1. **Always capture to Float32Array** (current behavior, unchanged)
2. **Always analyze from Float32Array** (quality guarantee for Basic Pitch)
3. **For storage**, offer a setting:
   - **"Lossless" (default):** Store as Float32 PCM (current behavior). Largest, but bit-perfect.
   - **"Compressed":** Encode to MP3 via lamejs before storing to OPFS. 82% space savings. File extension: `.mp3`.
4. **For playback from storage:**
   - PCM: encode to WAV blob on the fly (current behavior)
   - MP3: decode via `decodeAudioData`, then same WAV blob path, OR play the MP3 blob directly

---

## 5. Combined Implementation Plan

### Phase 1: Audio Import (no new dependencies)

| # | Task | Files |
|---|------|-------|
| 1 | Create `useAudioImport` hook (decode + resample) | `src/hooks/useAudioImport.ts` |
| 2 | Add `handleImport` to `useRiffSession` | `src/hooks/useRiffSession.ts` |
| 3 | Add Import button + file input to Recorder UI | `src/components/Recorder.tsx` |
| 4 | Add drag-and-drop support (optional, stretch) | `src/components/Recorder.tsx` |
| 5 | Unit tests for import flow | `src/hooks/useAudioImport.test.ts` |
| 6 | E2E test with fixture audio file | `tests/e2e/import.spec.ts`, `tests/fixtures/test-riff.mp3` |

### Phase 2: MP3 Storage (add lamejs dependency)

| # | Task | Files |
|---|------|-------|
| 1 | Install `@breezystack/lamejs` (or `lamejs`) | `package.json` |
| 2 | Create `src/lib/mp3Encoder.ts` (Float32 → MP3 Blob) | New file |
| 3 | Create `src/workers/mp3Encoder.worker.ts` (run encoding off main thread) | New file |
| 4 | Update `audioStorage.ts` to handle MP3 persistence | `src/lib/audioStorage.ts` |
| 5 | Update `db.ts` schema to track format per riff | `src/lib/db.ts` |
| 6 | Add format picker to settings/UI | `src/components/Recorder.tsx` |
| 7 | Update playback to handle MP3 restore | `src/hooks/useAudioPlayback.ts` |
| 8 | Tests | Multiple |

### Phase ordering

Phase 1 (Import) is **independent** and has **zero new dependencies**. Ship it first — it immediately helps with testing and development workflow.

Phase 2 (MP3) adds a dependency and touches more of the storage layer. Ship as a fast-follow or defer based on how much storage pressure users actually experience.

---

## 6. Open Questions

1. **Max file size for imports?** — Should we cap imported files (e.g., 10 MB / 2 minutes) to prevent OOM from large audio files during `decodeAudioData`?
2. **Stereo imports?** — Should we mix to mono, or analyze left channel only? (Recommend: mix to mono via averaging L+R channels)
3. **MP3 bitrate setting exposed to user?** — Or just default 128 kbps? (Recommend: just default, fewer knobs)
4. **Format migration?** — If a user switches from PCM to MP3 storage, do we re-encode existing riffs? (Recommend: no, new setting applies to new recordings only)
