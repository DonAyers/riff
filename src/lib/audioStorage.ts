export async function savePcmToOpfs(fileName: string, pcm: Float32Array): Promise<boolean> {
  if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) {
    return false;
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
    return false;
  }
}

export async function readPcmFromOpfs(fileName: string): Promise<Float32Array | null> {
  if (!("storage" in navigator) || !("getDirectory" in navigator.storage)) {
    return null;
  }

  try {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return new Float32Array(buffer);
  } catch {
    return null;
  }
}
