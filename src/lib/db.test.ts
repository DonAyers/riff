import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MappedNote } from "./noteMapper";

const { mockDb, mockOpenDB } = vi.hoisted(() => {
  const db = {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    getAll: vi.fn(),
    getAllFromIndex: vi.fn(),
  };

  return {
    mockDb: db,
    mockOpenDB: vi.fn().mockResolvedValue(db),
  };
});

// Mock idb so the module-level openDB call doesn't require a real IndexedDB.
vi.mock("idb", () => ({
  openDB: mockOpenDB,
}));

import type { StoredRiff, RiffSession } from "./db";
import {
  deleteAudioBlobFromIndexedDB,
  normalizeSession,
  readAudioBlobFromIndexedDB,
  saveAudioBlobToIndexedDB,
} from "./db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<MappedNote> = {}): MappedNote {
  return {
    midi: 60,
    name: "C4",
    pitchClass: "C",
    octave: 4,
    startTimeS: 0,
    durationS: 0.5,
    amplitude: 0.8,
    ...overrides,
  };
}

function makeStoredRiff(overrides: Partial<StoredRiff> = {}): StoredRiff {
  return {
    id: "riff-1",
    name: "Test Riff",
    timestamp: 1_700_000_000_000,
    durationS: 4.2,
    notes: [makeNote()],
    chord: "Cmaj",
    audioFileName: "riff-1.webm",
    audioFormat: "compressed",
    audioMime: "audio/webm;codecs=opus",
    ...overrides,
  };
}

function makeRiffSession(overrides: Partial<RiffSession> = {}): RiffSession {
  return {
    id: "session-1",
    name: "Test Session",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
    source: "recording",
    durationS: 4.2,
    audioFileName: "session-1.webm",
    audioFormat: "compressed",
    audioMime: "audio/webm;codecs=opus",
    profileId: "guitar",
    notes: [makeNote()],
    chordTimeline: [
      {
        chord: "Cmaj",
        label: "C",
        startTimeS: 0,
        endTimeS: 2,
      },
    ],
    keyDetection: {
      primary: {
        key: "C",
        mode: "major",
        label: "C major",
        confidence: 0.9,
        correlation: 0.85,
      },
      alternatives: [],
      ranked: [],
      lowConfidence: false,
    },
    primaryChord: "Cmaj",
    uniqueNoteNames: ["C"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("normalizeSession", () => {
  beforeEach(() => {
    mockDb.put.mockReset();
    mockDb.get.mockReset();
    mockDb.delete.mockReset();
    mockDb.getAll.mockReset();
    mockDb.getAllFromIndex.mockReset();
  });

  describe("v1 StoredRiff → RiffSession", () => {
    it("migrates all required fields from a v1 record", () => {
      const v1 = makeStoredRiff();
      const session = normalizeSession(v1);

      expect(session.id).toBe(v1.id);
      expect(session.name).toBe(v1.name);
      expect(session.createdAt).toBe(v1.timestamp);
      expect(session.updatedAt).toBe(v1.timestamp);
      expect(session.source).toBe("recording");
      expect(session.durationS).toBe(v1.durationS);
      expect(session.audioFileName).toBe(v1.audioFileName);
      expect(session.audioFormat).toBe(v1.audioFormat);
      expect(session.audioMime).toBe(v1.audioMime);
      expect(session.profileId).toBe("guitar");
      expect(session.notes).toEqual(v1.notes);
      expect(session.chordTimeline).toEqual([]);
      expect(session.keyDetection).toBeNull();
      expect(session.primaryChord).toBe(v1.chord);
      expect(session.uniqueNoteNames).toEqual(["C"]);
    });

    it("sets primaryChord to null when v1 chord is null", () => {
      const v1 = makeStoredRiff({ chord: null });
      const session = normalizeSession(v1);

      expect(session.primaryChord).toBeNull();
    });

    it("handles missing optional audio fields", () => {
      const v1 = makeStoredRiff({
        audioFormat: undefined,
        audioMime: undefined,
        audioFileName: null,
      });
      const session = normalizeSession(v1);

      expect(session.audioFormat).toBeUndefined();
      expect(session.audioMime).toBeUndefined();
      expect(session.audioFileName).toBeNull();
    });

    it("handles empty notes array", () => {
      const v1 = makeStoredRiff({ notes: [] });
      const session = normalizeSession(v1);

      expect(session.notes).toEqual([]);
      expect(session.uniqueNoteNames).toEqual([]);
    });

    it("derives unique, sorted pitch classes from notes", () => {
      const v1 = makeStoredRiff({
        notes: [
          makeNote({ pitchClass: "E", name: "E3" }),
          makeNote({ pitchClass: "C", name: "C4" }),
          makeNote({ pitchClass: "G", name: "G4" }),
          makeNote({ pitchClass: "C", name: "C5" }), // duplicate pitch class
          makeNote({ pitchClass: "E", name: "E4" }), // duplicate pitch class
        ],
      });
      const session = normalizeSession(v1);

      expect(session.uniqueNoteNames).toEqual(["C", "E", "G"]);
    });

    it("preserves importFileName as undefined (v1 records have no imports)", () => {
      const v1 = makeStoredRiff();
      const session = normalizeSession(v1);

      expect(session.importFileName).toBeUndefined();
    });
  });

  describe("v2 RiffSession passthrough", () => {
    it("returns the same v2 record unchanged", () => {
      const v2 = makeRiffSession();
      const result = normalizeSession(v2);

      expect(result).toBe(v2); // reference equality – no copy
    });

    it("preserves all v2 fields including optional ones", () => {
      const v2 = makeRiffSession({
        source: "import",
        importFileName: "song.mp3",
        profileId: "default",
      });
      const result = normalizeSession(v2);

      expect(result.source).toBe("import");
      expect(result.importFileName).toBe("song.mp3");
      expect(result.profileId).toBe("default");
    });

    it("preserves v2 chordTimeline and keyDetection", () => {
      const v2 = makeRiffSession();
      const result = normalizeSession(v2);

      expect(result.chordTimeline).toEqual(v2.chordTimeline);
      expect(result.keyDetection).toEqual(v2.keyDetection);
    });

    it("passes through a v2 session with null keyDetection", () => {
      const v2 = makeRiffSession({ keyDetection: null });
      const result = normalizeSession(v2);

      expect(result.keyDetection).toBeNull();
    });
  });
});

describe("audio blob fallback storage", () => {
  beforeEach(() => {
    mockDb.put.mockReset();
    mockDb.get.mockReset();
    mockDb.delete.mockReset();
  });

  it("stores fallback audio blobs in IndexedDB", async () => {
    const blob = new Blob(["riff"], { type: "audio/webm" });
    mockDb.put.mockResolvedValue(undefined);

    await expect(saveAudioBlobToIndexedDB("riff-1.webm", blob)).resolves.toBe(true);
    expect(mockDb.put).toHaveBeenCalledWith("audioBlobs", blob, "riff-1.webm");
  });

  it("reads fallback audio blobs from IndexedDB", async () => {
    const blob = new Blob(["riff"], { type: "audio/webm" });
    mockDb.get.mockResolvedValue(blob);

    await expect(readAudioBlobFromIndexedDB("riff-1.webm")).resolves.toBe(blob);
    expect(mockDb.get).toHaveBeenCalledWith("audioBlobs", "riff-1.webm");
  });

  it("deletes fallback audio blobs from IndexedDB", async () => {
    mockDb.delete.mockResolvedValue(undefined);

    await expect(deleteAudioBlobFromIndexedDB("riff-1.webm")).resolves.toBeUndefined();
    expect(mockDb.delete).toHaveBeenCalledWith("audioBlobs", "riff-1.webm");
  });
});
