import { openDB, type DBSchema } from "idb";
import type { MappedNote } from "./noteMapper";
import type { AudioFormat } from "./audioEncoder";

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

interface RiffDb extends DBSchema {
  riffs: {
    key: string;
    value: StoredRiff;
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
const DB_VERSION = 1;

const dbPromise = openDB<RiffDb>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains("riffs")) {
      const riffStore = db.createObjectStore("riffs", { keyPath: "id" });
      riffStore.createIndex("by-timestamp", "timestamp");
    }

    if (!db.objectStoreNames.contains("settings")) {
      db.createObjectStore("settings", { keyPath: "key" });
    }
  },
});

export async function saveRiff(riff: StoredRiff): Promise<void> {
  const db = await dbPromise;
  await db.put("riffs", riff);
}

export async function listRiffs(): Promise<StoredRiff[]> {
  const db = await dbPromise;
  const all = await db.getAllFromIndex("riffs", "by-timestamp");
  return all.sort((a, b) => b.timestamp - a.timestamp);
}
