export interface InstrumentProfile {
  label: string;
  midiRange: [number, number];
  minAmplitude: number;
  minDurationS: number;
  /** Notes within this window (seconds) are grouped into one chord. 0 = no windowing. */
  chordWindowS: number;
  /** Basic Pitch onset probability needed to start a note. */
  onsetThreshold: number;
  /** Basic Pitch frame probability needed to keep a note sounding. */
  frameThreshold: number;
  /** Shortest note Basic Pitch keeps, in ~11.6 ms model frames. */
  minNoteLenFrames: number;
}

export const PROFILE_IDS = ["default", "guitar"] as const;

export type ProfileId = (typeof PROFILE_IDS)[number];

const FALLBACK_PROFILE_ID: ProfileId = "guitar";

export interface NormalizedStoredProfileId {
  profileId: ProfileId;
  didMigrate: boolean;
}

export const PROFILES: Record<ProfileId, InstrumentProfile> = {
  default: {
    label: "Full range",
    midiRange: [21, 108],
    minAmplitude: 0,
    minDurationS: 0,
    chordWindowS: 0,
    onsetThreshold: 0.5,
    frameThreshold: 0.3,
    minNoteLenFrames: 5,
  },
  guitar: {
    label: "Guitar",
    // D2 is the lowest open string among the tuner's presets (drop D, DADGAD, open G/D).
    midiRange: [38, 88],
    minAmplitude: 0.15,
    minDurationS: 0.05,
    chordWindowS: 0.15,
    onsetThreshold: 0.5,
    frameThreshold: 0.3,
    minNoteLenFrames: 6,
  },
};

export function normalizeProfileId(value: string | null | undefined): ProfileId {
  return normalizeStoredProfileId(value).profileId;
}

export function normalizeStoredProfileId(value: string | null | undefined): NormalizedStoredProfileId {
  if (value === "default" || value === "guitar") {
    return {
      profileId: value,
      didMigrate: false,
    };
  }

  return {
    profileId: FALLBACK_PROFILE_ID,
    didMigrate: value !== null && value !== undefined,
  };
}
