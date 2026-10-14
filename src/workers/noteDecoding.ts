import type { NoteEventTime } from "@spotify/basic-pitch";

type BasicPitchModule = typeof import("@spotify/basic-pitch");

export interface NoteDecodingOptions {
  /** Onset probability a note needs to start (Basic Pitch `onsetThresh`). */
  onsetThreshold?: number;
  /** Frame probability a note needs to keep sounding (Basic Pitch `frameThresh`). */
  frameThreshold?: number;
  /** Shortest note kept, in model frames of ~11.6 ms (Basic Pitch `minNoteLen`). */
  minNoteLenFrames?: number;
}

// Basic Pitch's own defaults, from @spotify/basic-pitch's outputToNotesPoly signature.
export const DEFAULT_ONSET_THRESHOLD = 0.5;
export const DEFAULT_FRAME_THRESHOLD = 0.3;
export const DEFAULT_MIN_NOTE_LEN_FRAMES = 5;

/**
 * Turn raw Basic Pitch model output into timed notes.
 * outputToNotesPoly's positional order is (frames, onsets, onsetThresh, frameThresh, minNoteLen, ...);
 * keeping the call in one place stops options sliding into the wrong slot.
 */
export function decodeNoteEvents(
  basicPitch: Pick<BasicPitchModule, "outputToNotesPoly" | "noteFramesToTime">,
  frames: number[][],
  onsets: number[][],
  options: NoteDecodingOptions,
): NoteEventTime[] {
  const noteEvents = basicPitch.outputToNotesPoly(
    frames,
    onsets,
    options.onsetThreshold ?? DEFAULT_ONSET_THRESHOLD,
    options.frameThreshold ?? DEFAULT_FRAME_THRESHOLD,
    options.minNoteLenFrames ?? DEFAULT_MIN_NOTE_LEN_FRAMES,
  );
  return basicPitch.noteFramesToTime(noteEvents);
}
