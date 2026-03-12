import { openDB, type DBSchema } from "idb";
import type { MappedNote } from "./noteMapper";
import type { AudioFormat } from "./audioEncoder";
import type { ChordEvent } from "./chordDetector";
import type { KeyDetection } from "./keyDetector";
import type { ProfileId } from "./instrumentProfiles";

// ---------------------------------------------------------------------------
// V1 schema – kept for backward-compat and migration
// ---------------------------------------------------------------------------

export interface StoredRiff {
  id: string;
  name: string;
  timestamp: number;
  durationS: number;
  notes: MappedNote[];
  chord: string | null;
  audioFileName: string | null;
  /** Storage format: "pcm" (raw Float32) or "compressed" (WebM/Opus, MP4/AAC, etc.) */
  audioFormat?: AudioFormat;
  /** MIME type of the stored compressed audio (e.g. "audio/webm;codecs=opus") */
  audioMime?: string;
}

// ---------------------------------------------------------------------------
// V2 schema – the canonical session shape going forward
// ---------------------------------------------------------------------------

export interface RiffSession {
  id: string;
  name: string;
  /** Unix milliseconds – when the session was first created. */
  createdAt: number;
  /** Unix milliseconds – last time session metadata was written. */
  updatedAt: number;
  source: "recording" | "import";
  importFileName?: string;
  durationS: number;
  audioFileName: string | null;
  audioFormat?: AudioFormat;
  audioMime?: string;
  profileId: ProfileId;
  readonly notes: readonly MappedNote[];
  readonly chordTimeline: readonly ChordEvent[];
  keyDetection: KeyDetection | null;
  primaryChord: string | null;
  readonly uniqueNoteNames: readonly string[];
}

// ---------------------------------------------------------------------------
// Migration / normalization
// ---------------------------------------------------------------------------

/** Type guard: returns true when `record` is a v1 `StoredRiff` (has `timestamp`, no `createdAt`). */
function isStoredRiff(record: StoredRiff | RiffSession): record is StoredRiff {
  return "timestamp" in record && !("createdAt" in record);
}

/** Derive sorted, unique pitch-class names from a notes array. */
function deriveUniqueNoteNames(notes: readonly MappedNote[]): string[] {
  const seen = new Set<string>();
  for (const n of notes) {
    seen.add(n.pitchClass);
  }
  return [...seen].sort();
}

/**
 * Normalize a v1 `StoredRiff` or v2 `RiffSession` into a valid `RiffSession`.
 *
 * V1 records are migrated with safe defaults:
 * - `createdAt` / `updatedAt` ← `timestamp`
 * - `source` ← `"recording"`
 * - `profileId` ← `"guitar"`
 * - `chordTimeline` ← `[]` (needs re-analysis)
 * - `keyDetection` ← `null` (needs re-analysis)
 * - `primaryChord` ← `chord`
 * - `uniqueNoteNames` ← derived from notes
 *
 * V2 records pass through unchanged.
 */
export function normalizeSession(
  record: StoredRiff | RiffSession,
): RiffSession {
  if (!isStoredRiff(record)) {
    return record;
  }

  const notes: readonly MappedNote[] = record.notes ?? [];

  return {
    id: record.id,
    name: record.name,
    createdAt: record.timestamp,
    updatedAt: record.timestamp,
    source: "recording",
    durationS: record.durationS,
    audioFileName: record.audioFileName,
    ...(record.audioFormat != null && { audioFormat: record.audioFormat }),
    ...(record.audioMime != null && { audioMime: record.audioMime }),
    profileId: "guitar",
    notes,
    chordTimeline: [],
    keyDetection: null,
    primaryChord: record.chord ?? null,
    uniqueNoteNames: deriveUniqueNoteNames(notes),
  };
}

// ---------------------------------------------------------------------------
// IndexedDB schema & setup
// ---------------------------------------------------------------------------

/**
 * The DB value type is a union so reads can encounter either shape.
 * We always normalize on read via `normalizeSession`.
 */
type RiffRecord = StoredRiff | RiffSession;

interface RiffDb extends DBSchema {
  riffs: {
    key: string;
    value: RiffRecord;
    indexes: {
      "by-timestamp": number;
    };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: string;
    };
  };
}

const DB_NAME = "riff-db";
const DB_VERSION = 2;

const dbPromise = openDB<RiffDb>(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion) {
    // V1 → create stores
    if (oldVersion < 1) {
      const riffStore = db.createObjectStore("riffs", { keyPath: "id" });
      riffStore.createIndex("by-timestamp", "timestamp");
    }

    if (!db.objectStoreNames.contains("settings")) {
      db.createObjectStore("settings", { keyPath: "key" });
    }

    // V2 → no structural changes; records are normalized on read.
  },
});

// ---------------------------------------------------------------------------
// V2 CRUD operations
// ---------------------------------------------------------------------------

export async function saveSession(session: RiffSession): Promise<void> {
  const db = await dbPromise;
  // Cast required because the union value type confuses idb's put() overload.
  await db.put("riffs", session as RiffRecord);
}

export async function listSessions(): Promise<RiffSession[]> {
  const db = await dbPromise;
  const all = await db.getAll("riffs");
  return all
    .map(normalizeSession)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await dbPromise;
  await db.delete("riffs", id);
}

// ---------------------------------------------------------------------------
// Deprecated V1 helpers – kept until callers are migrated
// ---------------------------------------------------------------------------

/**
 * @deprecated Use {@link saveSession} instead.
 */
export async function saveRiff(riff: StoredRiff): Promise<void> {
  const db = await dbPromise;
  await db.put("riffs", riff as RiffRecord);
}

/**
 * @deprecated Use {@link listSessions} instead.
 */
export async function listRiffs(): Promise<StoredRiff[]> {
  const db = await dbPromise;
  const all = await db.getAllFromIndex("riffs", "by-timestamp");
  // Filter to v1-shaped records and sort. V2 records won't have `timestamp`,
  // but existing callers only expect v1 data anyway.
  return (all as StoredRiff[]).sort(
    (a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0),
  );
}
