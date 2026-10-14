import { describe, expect, it, vi } from "vitest";
import { decodeNoteEvents } from "./noteDecoding";

function createFakeModule() {
  const noteEvents = [{ startFrame: 0, durationFrames: 10, pitchMidi: 60, amplitude: 0.8 }];
  const timedNotes = [{ startTimeSeconds: 0, durationSeconds: 0.1, pitchMidi: 60, amplitude: 0.8 }];
  return {
    outputToNotesPoly: vi.fn(() => noteEvents),
    noteFramesToTime: vi.fn(() => timedNotes),
    noteEvents,
    timedNotes,
  };
}

describe("decodeNoteEvents", () => {
  it("passes thresholds in Basic Pitch's (onsetThresh, frameThresh, minNoteLen) order", () => {
    const fakeModule = createFakeModule();
    const frames = [[0.1]];
    const onsets = [[0.2]];

    const result = decodeNoteEvents(fakeModule, frames, onsets, {
      onsetThreshold: 0.55,
      frameThreshold: 0.25,
      minNoteLenFrames: 7,
    });

    expect(fakeModule.outputToNotesPoly).toHaveBeenCalledWith(frames, onsets, 0.55, 0.25, 7);
    expect(fakeModule.noteFramesToTime).toHaveBeenCalledWith(fakeModule.noteEvents);
    expect(result).toBe(fakeModule.timedNotes);
  });

  it("falls back to Basic Pitch's own defaults", () => {
    const fakeModule = createFakeModule();

    decodeNoteEvents(fakeModule, [], [], {});

    expect(fakeModule.outputToNotesPoly).toHaveBeenCalledWith([], [], 0.5, 0.3, 5);
  });
});
