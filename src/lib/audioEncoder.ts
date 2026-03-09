export type AudioFormat = "pcm" | "compressed";

const CODEC_PREFERENCES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=aac",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

/**
 * Detect the best compressed audio MIME type supported by this browser's MediaRecorder.
 * Returns null if no compressed codec is available.
 */
export function detectBestCodec(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of CODEC_PREFERENCES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

/** Map a MIME type to a file extension for OPFS storage. */
export function mimeToExtension(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  return "bin";
}

/**
 * Encode a Float32Array (mono, any sample rate) to a compressed audio Blob
 * using the browser's native MediaRecorder.
 *
 * Returns null if no suitable codec is available.
 */
export async function encodeCompressed(
  pcm: Float32Array,
  sampleRate: number,
): Promise<{ blob: Blob; mime: string } | null> {
  const mime = detectBestCodec();
  if (!mime) return null;

  const ctx = new OfflineAudioContext(1, pcm.length, sampleRate);
  const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
  buffer.getChannelData(0).set(pcm);

  // We need a real AudioContext + MediaRecorder to encode.
  // OfflineAudioContext can't drive MediaRecorder, so we play
  // the buffer through a real AudioContext into a MediaStreamDestination.
  const realCtx = new AudioContext({ sampleRate });
  const dest = realCtx.createMediaStreamDestination();
  const source = realCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(dest);

  const recorder = new MediaRecorder(dest.stream, { mimeType: mime });
  const chunks: Blob[] = [];

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: mime }));
    };
    recorder.onerror = () => reject(new Error("MediaRecorder encoding failed"));
  });

  recorder.start();
  source.start();

  // Stop recording once the buffer finishes playing
  source.onended = () => {
    recorder.stop();
  };

  try {
    const blob = await done;
    return { blob, mime };
  } finally {
    await realCtx.close();
  }
}
