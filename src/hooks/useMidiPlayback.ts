import { useCallback, useEffect, useRef, useState } from "react";
import { Soundfont } from "smplr";
import type { MappedNote } from "../lib/noteMapper";

export interface UseMidiPlaybackReturn {
  load: (notes: MappedNote[]) => void;
  play: () => Promise<void>;
  previewNote: (midi: number, amplitude?: number) => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  duration: number;
}

function getDuration(notes: MappedNote[]): number {
  if (notes.length === 0) return 0;
  return Math.max(...notes.map((n) => n.startTimeS + n.durationS));
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
        instrument: "acoustic_grand_piano",
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
      const velocity = Math.max(10, Math.min(100, Math.round((note.amplitude || 0.2) * 127 * 3))); // Scale amplitude safely
      
      sampler.start({
        note: note.midi,
        velocity,
        time: startAt + note.startTimeS,
        duration: note.durationS,
      });
    }

    endTimerRef.current = window.setTimeout(() => {
      setIsPlaying(false);
      clearPlayback();
    }, Math.ceil((clipDuration + 0.1) * 1000));
  }, [clearPlayback, getAudioContext, getSampler]);

  const previewNote = useCallback(async (midi: number, amplitude = 0.2) => {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const sampler = getSampler();
    
    // Scale basic-pitch amplitude (usually 0.1-0.4) to 0-127 velocity
    const velocity = Math.max(20, Math.min(100, Math.round(amplitude * 127 * 3)));
    
    sampler.start({
      note: midi,
      velocity,
      time: ctx.currentTime,
      duration: 0.5,
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