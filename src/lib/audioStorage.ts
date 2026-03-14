import {
  deleteAudioBlobFromIndexedDB,
  readAudioBlobFromIndexedDB,
  saveAudioBlobToIndexedDB,
} from "./db";

function canUseOpfs(): boolean {
  return (
    "storage" in navigator &&
    navigator.storage !== undefined &&
    "getDirectory" in navigator.storage
  );
}

function packPcmBlob(pcm: Float32Array): Blob {
  const audioCopy = new Float32Array(pcm);
  return new Blob([audioCopy.buffer], { type: "application/octet-stream" });
}

export async function savePcmToOpfs(fileName: string, pcm: Float32Array): Promise<boolean> {
  if (!canUseOpfs()) {
    return saveAudioBlobToIndexedDB(fileName, packPcmBlob(pcm));
  }

  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();

    // Copy into a tightly packed buffer before writing.
    const audioCopy = new Float32Array(pcm);
    await writable.write(audioCopy.buffer);
    await writable.close();
    return true;
  } catch {
    return saveAudioBlobToIndexedDB(fileName, packPcmBlob(pcm));
  }
}

export async function readPcmFromOpfs(fileName: string): Promise<Float32Array | null> {
  if (!canUseOpfs()) {
    const fallbackBlob = await readAudioBlobFromIndexedDB(fileName);
    if (!fallbackBlob) {
      return null;
    }

    return new Float32Array(await fallbackBlob.arrayBuffer());
  }

  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return new Float32Array(buffer);
  } catch {
    const fallbackBlob = await readAudioBlobFromIndexedDB(fileName);
    if (!fallbackBlob) {
      return null;
    }

    return new Float32Array(await fallbackBlob.arrayBuffer());
  }
}

export async function saveBlobToOpfs(fileName: string, blob: Blob): Promise<boolean> {
  if (!canUseOpfs()) {
    return saveAudioBlobToIndexedDB(fileName, blob);
  }

  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch {
    return saveAudioBlobToIndexedDB(fileName, blob);
  }
}

export async function readBlobFromOpfs(fileName: string, mime: string): Promise<Blob | null> {
  if (!canUseOpfs()) {
    const fallbackBlob = await readAudioBlobFromIndexedDB(fileName);
    return fallbackBlob ? new Blob([fallbackBlob], { type: mime }) : null;
  }

  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return new Blob([await file.arrayBuffer()], { type: mime });
  } catch {
    const fallbackBlob = await readAudioBlobFromIndexedDB(fileName);
    return fallbackBlob ? new Blob([fallbackBlob], { type: mime }) : null;
  }
}

export async function deleteStoredAudio(fileName: string): Promise<void> {
  if (canUseOpfs()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(fileName);
    } catch {
      // Ignore missing or inaccessible OPFS entries; IndexedDB cleanup still matters.
    }
  }

  await deleteAudioBlobFromIndexedDB(fileName);
}
