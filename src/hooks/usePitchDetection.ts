import { useCallback, useRef, useState } from "react";
import { BasicPitch, noteFramesToTime, outputToNotesPoly } from "@spotify/basic-pitch";
import type { NoteEventTime } from "@spotify/basic-pitch";

export interface DetectedNote {
  pitchMidi: number;
  startTimeS: number;
  durationS: number;
  amplitude: number;
}

export interface UsePitchDetectionReturn {
  detect: (audio: Float32Array) => Promise<DetectedNote[]>;
  isLoading: boolean;
  progress: number;
  error: string | null;
}

// Path to the model bundled with @spotify/basic-pitch
const MODEL_URL = new URL(
  "@spotify/basic-pitch/model/model.json",
  import.meta.url
).href;

export function usePitchDetection(): UsePitchDetectionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const modelRef = useRef<BasicPitch | null>(null);

  const getModel = useCallback(async (): Promise<BasicPitch> => {
    if (modelRef.current) return modelRef.current;
    const model = new BasicPitch(MODEL_URL);
    modelRef.current = model;
    return model;
  }, []);

  const detect = useCallback(
    async (audio: Float32Array): Promise<DetectedNote[]> => {
      setIsLoading(true);
      setProgress(0);
      setError(null);

      try {
        const model = await getModel();

        const frames: number[][] = [];
        const onsets: number[][] = [];
        const contours: number[][] = [];

        await model.evaluateModel(
          audio,
          (f: number[][], o: number[][], c: number[][]) => {
            frames.push(...f);
            onsets.push(...o);
            contours.push(...c);
          },
          (p: number) => {
            setProgress(Math.round(p * 100));
          }
        );

        // Convert raw model output to structured note events
        const noteEvents = outputToNotesPoly(frames, onsets, 0.5, 0.3, 5);
        const timedNotes: NoteEventTime[] = noteFramesToTime(noteEvents);

        return timedNotes.map((n) => ({
          pitchMidi: n.pitchMidi,
          startTimeS: n.startTimeSeconds,
          durationS: n.durationSeconds,
          amplitude: n.amplitude,
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Pitch detection failed";
        setError(message);
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [getModel]
  );

  return { detect, isLoading, progress, error };
}
