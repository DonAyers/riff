export interface InstrumentProfile {
  label: string;
  midiRange: [number, number];
  maxPolyphony: number;
  minAmplitude: number;
  minDurationS: number;
  /** Notes within this window (seconds) are grouped into one chord. 0 = no windowing. */
  chordWindowS: number;
  confidenceThreshold: number;
  onsetThreshold: number;
}

export type ProfileId = "default" | "guitar" | "piano";

export const PROFILES: Record<ProfileId, InstrumentProfile> = {
  default: {
    label: "Default",
    midiRange: [21, 108],
    maxPolyphony: 5,
    minAmplitude: 0,
    minDurationS: 0,
    chordWindowS: 0,
    confidenceThreshold: 0.5,
    onsetThreshold: 0.3,
  },
  guitar: {
    label: "Guitar",
    midiRange: [40, 88],
    maxPolyphony: 6,
    minAmplitude: 0.15,
    minDurationS: 0.05,
    chordWindowS: 0.15,
    confidenceThreshold: 0.5,
    onsetThreshold: 0.3,
  },
  piano: {
    label: "Piano",
    midiRange: [21, 108],
    maxPolyphony: 10,
    minAmplitude: 0.1,
    minDurationS: 0.03,
    chordWindowS: 0.2,
    confidenceThreshold: 0.5,
    onsetThreshold: 0.3,
  },
};

export const PROFILE_IDS = Object.keys(PROFILES) as ProfileId[];
