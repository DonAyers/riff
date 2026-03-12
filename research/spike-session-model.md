# Spike: Session-centric data model

## Status

Spike — exploratory, no implementation commitment yet.

## Problem

Today a "saved riff" is a flat record that captures partial state:

```ts
interface StoredRiff {
  id: string;
  name: string;
  timestamp: number;
  durationS: number;
  notes: MappedNote[];      // analysis output
  chord: string | null;     // single "most prominent" chord
  audioFileName: string | null; // OPFS reference
  audioFormat?: AudioFormat;
  audioMime?: string;
}
```

### What's missing

| Gap | Why it matters |
|-----|----------------|
| **Chord timeline** | Only a single `chord` is stored; the full `ChordEvent[]` timeline is ephemeral. Opening an old riff loses the chord progression. |
| **Key detection** | `KeyDetection` (key, scale, confidence) is derived on the fly and lost when the session changes. |
| **Profile used** | No record of which instrument profile produced the analysis. Switching profile after loading an old riff creates a mismatch. |
| **Unique notes** | The de-duplicated note list is derived but could be cached for faster restore. |
| **MIDI blob** | MIDI is re-generated on demand from `notes`. Fine for now, but if we add user-edited MIDI later, we need a home for it. |
| **Chord voicings** | Selected guitar voicings (from the chord dialog) aren't saved. The user's curation is lost. |
| **Session concept** | There's no first-class notion of a "session". A riff is just notes + one chord + audio. Opening an old riff should restore the *entire* workspace state. |

### UI problems

- **SavedRiffs list is always visible** — takes 50-150px per item on mobile, pushing analysis results below the fold.
- **No collapse/expand** — no accordion, dropdown, or drawer. Every saved riff is always rendered.
- **Sparse metadata** — only name, date, note count, duration. No chord summary, no profile badge.

---

## Proposed schema: `RiffSession`

A session is the complete bundle of everything the user produced in one sitting.

```ts
/** v2 schema — bumps DB_VERSION to 2 */
interface RiffSession {
  /** UUID primary key */
  id: string;

  /** User-visible name, auto-generated from timestamp, editable later */
  name: string;

  /** Unix ms — creation time */
  createdAt: number;

  /** Unix ms — last modified */
  updatedAt: number;

  // ── Input ──────────────────────────────────────────────
  /** Source of audio: "recording" | "import" */
  source: "recording" | "import";

  /** Original file name if imported (e.g. "my-song.mp3") */
  importFileName?: string;

  /** Duration of the input audio in seconds */
  durationS: number;

  /** OPFS file reference for the stored audio */
  audioFileName: string | null;

  /** "pcm" | "compressed" */
  audioFormat?: AudioFormat;

  /** MIME type for compressed audio */
  audioMime?: string;

  // ── Analysis ───────────────────────────────────────────
  /** Profile used for this analysis pass */
  profileId: ProfileId;

  /** Full detected notes array */
  notes: MappedNote[];

  /** Chord timeline — the full progression, not just one chord */
  chordTimeline: ChordEvent[];

  /** Key/scale detection result */
  keyDetection: KeyDetection | null;

  // ── Derived (cached for fast restore) ──────────────────
  /** Single "most prominent" chord — derived from chordTimeline */
  primaryChord: string | null;

  /** De-duplicated note names */
  uniqueNoteNames: string[];
}
```

### What changed from `StoredRiff`

| Field | Old | New |
|-------|-----|-----|
| `chord` | Single string | → `primaryChord` (same data, clearer name) |
| `chordTimeline` | ❌ ephemeral | ✅ persisted |
| `keyDetection` | ❌ ephemeral | ✅ persisted |
| `profileId` | ❌ not stored | ✅ persisted per-session |
| `source` | ❌ not tracked | ✅ "recording" or "import" |
| `importFileName` | ❌ not tracked | ✅ original file name |
| `createdAt` / `updatedAt` | `timestamp` only | Split into creation + modification |
| `uniqueNoteNames` | ❌ derived each time | ✅ cached |

### What we intentionally leave out (for now)

- **MIDI blob** — still regenerated on demand from `notes`. No user editing yet.
- **Chord voicing selections** — could be added as `selectedVoicings: Record<string, number>` (chord name → voicing index) in a future pass.
- **Waveform data** — too large to store; re-derived from audio.
- **BPM / tempo** — not detected yet.

---

## Migration strategy

### IndexedDB v1 → v2

```ts
upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    // create stores (existing logic)
  }
  if (oldVersion < 2) {
    // No structural change needed — same object store, just wider shape.
    // Old records missing new fields get defaults on read.
  }
}
```

We don't need to migrate stored data eagerly. Instead, normalize on read:

```ts
function normalizeSession(raw: StoredRiff | RiffSession): RiffSession {
  return {
    id: raw.id,
    name: raw.name,
    createdAt: raw.timestamp ?? raw.createdAt,
    updatedAt: raw.updatedAt ?? raw.timestamp ?? raw.createdAt,
    source: raw.source ?? "recording",
    durationS: raw.durationS,
    audioFileName: raw.audioFileName,
    audioFormat: raw.audioFormat,
    audioMime: raw.audioMime,
    profileId: raw.profileId ?? normalizeProfileId("guitar"),
    notes: raw.notes,
    chordTimeline: raw.chordTimeline ?? [],
    keyDetection: raw.keyDetection ?? null,
    primaryChord: raw.primaryChord ?? raw.chord ?? null,
    uniqueNoteNames: raw.uniqueNoteNames ?? [],
  };
}
```

Old records will have `chordTimeline: []` and `keyDetection: null`, which is fine — the analysis can be re-run.

---

## Saved sessions UI concept

### Current (problems)

```
┌─────────────────────────┐
│  Recent takes            │  ← always visible section heading
│  ┌─────────────────────┐│
│  │ Take 3:45 PM  [Open]││  ← ~55px per item
│  ├─────────────────────┤│
│  │ Take 2:12 PM  [Open]││
│  ├─────────────────────┤│
│  │ Take 1:00 PM  [Open]││
│  └─────────────────────┘│
└─────────────────────────┘
```

Takes 150-250px on mobile. Pushes analysis below the fold.

### Proposed: compact session picker

```
┌─────────────────────────────────────┐
│  [▾ Take 3:45 PM — Am, 42 notes]   │  ← single row, ~44px
└─────────────────────────────────────┘
       ↓ tap to expand
┌─────────────────────────────────────┐
│  ✓ Take 3:45 PM  Am  42 notes      │
│    Take 2:12 PM  G   18 notes      │
│    Take 1:00 PM  Em  31 notes      │
│  ─────────────────────────────────  │
│  Clear all sessions                 │
└─────────────────────────────────────┘
```

**Behavior:**
- **Collapsed (default):** Shows current session name + primary chord + note count in a single dropdown trigger row.
- **Expanded:** Dropdown overlay listing all sessions, sorted newest-first. Sparse: name, chord, note count. Checkmark on active session.
- **Tap a session:** Loads it fully — audio, notes, chord timeline, key, profile. Collapses picker.
- **No sessions saved:** Picker is hidden entirely (same as today).
- **New session:** Recording or importing creates a new session automatically.

**Space savings:** From 150-250px → 44px (collapsed) on mobile. ~80% reduction.

---

## Impact on useRiffSession

The hook's responsibilities shift slightly:

| Today | Proposed |
|-------|----------|
| Holds ephemeral notes/chord/key | Holds full `RiffSession` as state |
| `saveRiff()` writes partial data | `saveSession()` writes complete session |
| `loadRiff()` restores notes + audio | `loadSession()` restores entire workspace |
| Profile is a global setting | Profile is per-session (with global default for new sessions) |

The hook already does most of this — we're mainly adding persistence for `chordTimeline` and `keyDetection`, and making profile per-session.

---

## PianoRoll naming

The `PianoRoll` component is a DAW-industry standard term for the note timeline visualization. It is **not** an instrument reference. Renaming it would:
- Break convention with every DAW on the market
- Confuse developers familiar with music software
- Provide no user-facing benefit (the component name never appears in UI)

**Recommendation:** Keep `PianoRoll` as the component name. It's a visualization, not an instrument.

---

## Implementation phases

### Phase 1: Schema + migration (small, safe)
- Define `RiffSession` type in `db.ts`
- Add `normalizeSession()` read-time migration
- Bump DB_VERSION to 2
- Update `saveRiff` → `saveSession` to write full shape
- Update `listRiffs` → `listSessions` to return normalized sessions
- Update useRiffSession to persist chordTimeline + keyDetection + profileId

### Phase 2: Session picker UI
- Replace `SavedRiffs` list with `SessionPicker` dropdown
- Collapsed: current session summary in single row
- Expanded: overlay dropdown with session list
- Wire `loadSession()` to restore full workspace state

### Phase 3: Full session restore
- Loading a session restores profile, re-renders chord lane with saved voicings
- If audio exists in OPFS, playback is ready immediately
- If analysis data exists, skip re-analysis — show results instantly

### Phase 4 (future): Session enrichment
- Save selected chord voicings per session
- Add session renaming / deletion
- Add "re-analyze with different profile" action
- BPM detection when available

---

## Open questions

1. **Should profile switching re-analyze automatically?** Today it's a global setting. If it becomes per-session, switching profile on an existing session could trigger re-analysis.
2. **Session naming UX** — auto-generated "Take HH:MM" names are fine, but should users be able to rename? (Probably yes, but low priority.)
3. **Session deletion** — individual delete? Bulk clear? Swipe-to-delete on mobile?
4. **Max sessions stored** — should we cap IndexedDB + OPFS usage? Warn when storage is getting large?

---

## References

- Current schema: `src/lib/db.ts`
- Audio storage: `src/lib/audioStorage.ts`
- Session orchestrator: `src/hooks/useRiffSession.ts`
- Saved riffs UI: `src/components/SavedRiffs.tsx`
- Profile model: `src/lib/instrumentProfiles.ts`
