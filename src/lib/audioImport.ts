const TARGET_SAMPLE_RATE = 22050;
const MAX_DURATION_S = 120; // 2 minutes

/**
 * Decode an audio file (MP3, WAV, FLAC, etc.) to a mono Float32Array at 22,050 Hz.
 * Uses the browser's built-in decodeAudioData — no extra dependencies.
 */
export async function decodeAudioFile(file: File): Promise<Float32Array> {
  const arrayBuffer = await file.arrayBuffer();

  const audioContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await audioContext.decodeAudioData(arrayBuffer);
  } finally {
    await audioContext.close();
  }

  // Mix to mono by averaging all channels
  const mono = mixToMono(decoded);

  // Enforce max duration
  const maxSamples = MAX_DURATION_S * decoded.sampleRate;
  const trimmed = mono.length > maxSamples ? mono.slice(0, maxSamples) : mono;

  // Resample to target
  return resampleTo22050(trimmed, decoded.sampleRate);
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }

  const length = buffer.length;
  const mono = new Float32Array(length);
  const channelCount = buffer.numberOfChannels;

  for (let ch = 0; ch < channelCount; ch++) {
    const channelData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i];
    }
  }

  for (let i = 0; i < length; i++) {
    mono[i] /= channelCount;
  }

  return mono;
}

async function resampleTo22050(
  pcm: Float32Array,
  inputSampleRate: number,
): Promise<Float32Array> {
  if (inputSampleRate === TARGET_SAMPLE_RATE) {
    return pcm;
  }

  const frameCount = Math.ceil(
    (pcm.length * TARGET_SAMPLE_RATE) / inputSampleRate,
  );
  const offlineContext = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const buffer = offlineContext.createBuffer(1, pcm.length, inputSampleRate);
  buffer.getChannelData(0).set(pcm);

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineContext.destination);
  source.start();

  const rendered = await offlineContext.startRendering();
  return rendered.getChannelData(0).slice();
}
