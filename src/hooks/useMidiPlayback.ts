import { useCallback, useEffect, useRef, useState } from "react";
import { Soundfont } from "smplr";
import type { MappedNote } from "../lib/noteMapper";

const DEFAULT_INSTRUMENT = "acoustic_guitar_steel";
const GUITAR_SUSTAIN_FLOOR_S = 0.18;
const GUITAR_RELEASE_TAIL_S = 0.12;

export interface UseMidiPlaybackReturn {
  load: (notes: MappedNote[]) => void;
  play: () => Promise<void>;
  previewNote: (note: Pick<MappedNote, "midi" | "amplitude" | "durationS">) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  duration: number;
}

function getPlaybackDuration(durationS: number): number {
  return Math.max(durationS, GUITAR_SUSTAIN_FLOOR_S) + GUITAR_RELEASE_TAIL_S;
}

function getDuration(notes: Pick<MappedNote, "startTimeS" | "durationS">[]): number {
  if (notes.length === 0) return 0;
  return Math.max(...notes.map((note) => note.startTimeS + getPlaybackDuration(note.durationS)));
}

function getVelocity(amplitude = 0.2, minVelocity = 10): number {
  return Math.max(minVelocity, Math.min(100, Math.round(amplitude * 127 * 3)));
}

export function useMidiPlayback(): UseMidiPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  const notesRef = useRef<MappedNote[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const samplerRef = useRef<Soundfont | null>(null);
  const endTimerRef = useRef<number | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new window.AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const getSampler = useCallback(() => {
    if (!samplerRef.current) {
      const ctx = getAudioContext();
      samplerRef.current = new Soundfont(ctx, {
        instrument: DEFAULT_INSTRUMENT,
      });
    }
    return samplerRef.current;
  }, [getAudioContext]);

  const clearPlayback = useCallback(() => {
    if (endTimerRef.current !== null) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }

    if (samplerRef.current) {
      samplerRef.current.stop();
    }
  }, []);

  const load = useCallback(
    (notes: MappedNote[]) => {
      notesRef.current = notes;
      setDuration(getDuration(notes));
      clearPlayback();
      setIsPlaying(false);
      // Initialize sampler in the background when mapped
      getSampler();
    },
    [clearPlayback, getSampler]
  );

  const play = useCallback(async () => {
    const notes = notesRef.current;
    if (notes.length === 0) return;

    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    clearPlayback();
    setIsPlaying(true);

    const sampler = getSampler();
    await sampler.load; // wait for instrument to be loaded if not already

    const startAt = ctx.currentTime + 0.03;
    const clipDuration = getDuration(notes);

    for (const note of notes) {
      const velocity = getVelocity(note.amplitude);

      sampler.start({
        note: note.midi,
        velocity,
        time: startAt + note.startTimeS,
        duration: getPlaybackDuration(note.durationS),
      });
    }

    endTimerRef.current = window.setTimeout(() => {
      setIsPlaying(false);
      clearPlayback();
    }, Math.ceil((clipDuration + 0.1) * 1000));
  }, [clearPlayback, getAudioContext, getSampler]);

  const previewNote = useCallback(async (note: Pick<MappedNote, "midi" | "amplitude" | "durationS">) => {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const sampler = getSampler();

    const velocity = getVelocity(note.amplitude, 20);

    sampler.start({
      note: note.midi,
      velocity,
      time: ctx.currentTime,
      duration: getPlaybackDuration(note.durationS),
    });
  }, [getAudioContext, getSampler]);

  const stop = useCallback(() => {
    clearPlayback();
    setIsPlaying(false);
  }, [clearPlayback]);

  useEffect(() => {
    return () => {
      clearPlayback();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [clearPlayback]);

  return { load, play, previewNote, stop, isPlaying, duration };
}
