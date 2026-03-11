import * as lamejs from "@breezystack/lamejs";

export interface Mp3EncodeRequest {
  pcmAudio: Float32Array;
  sampleRate: number;
}

export interface Mp3EncodeResponse {
  blob?: Blob;
  error?: string;
}

self.onmessage = (e: MessageEvent<Mp3EncodeRequest>) => {
  try {
    const { pcmAudio, sampleRate } = e.data;
    
    // MP3 encoder only takes 16-bit ints
    const int16Samples = new Int16Array(pcmAudio.length);
    for (let i = 0; i < pcmAudio.length; i++) {
        const s = Math.max(-1, Math.min(1, pcmAudio[i]));
        int16Samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Mono, sample rate, 192 kbps
    const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 192);
    const mp3Buf = mp3encoder.encodeBuffer(int16Samples);
    const mp3BufFinal = mp3encoder.flush();

    const blobs: BlobPart[] = [];
    if (mp3Buf.length > 0) blobs.push(new Uint8Array(mp3Buf.buffer as ArrayBuffer, mp3Buf.byteOffset, mp3Buf.byteLength));
    if (mp3BufFinal.length > 0) blobs.push(new Uint8Array(mp3BufFinal.buffer as ArrayBuffer, mp3BufFinal.byteOffset, mp3BufFinal.byteLength));

    const blob = new Blob(blobs, { type: "audio/mp3" });
    self.postMessage({ blob });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Unknown encoding error" });
  }
};
