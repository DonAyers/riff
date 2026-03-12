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
