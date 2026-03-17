export const ANALYSIS_SAMPLE_RATE = 22050;

export interface PreparedAudio {
  analysisAudio: Float32Array;
  storedAudio: Float32Array;
  storedSampleRate: number;
}
