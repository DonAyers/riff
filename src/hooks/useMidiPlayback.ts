import { useCallback, useEffect, useRef, useState } from "react";
import type { MappedNote } from "../lib/noteMapper";

export interface UseMidiPlaybackReturn {
  load: (notes: MappedNote[]) => void;
  play: () => Promise<void>;
  stop: () => void;
  isPlaying: boolean;
  duration: number;
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
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
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainsRef = useRef<GainNode[]>([]);
  const endTimerRef = useRef<number | null>(null);

  const clearPlayback = useCallback(() => {
    if (endTimerRef.current !== null) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }

    for (const osc of oscillatorsRef.current) {
      try {
        osc.stop();
      } catch {
        // Ignore nodes already stopped
      }
      osc.disconnect();
    }
    oscillatorsRef.current = [];

    for (const gain of gainsRef.current) {
      gain.disconnect();
    }
    gainsRef.current = [];
  }, []);

  const load = useCallback(
    (notes: MappedNote[]) => {
      notesRef.current = notes;
      setDuration(getDuration(notes));
      clearPlayback();
      setIsPlaying(false);
    },
    [clearPlayback]
  );

  const play = useCallback(async () => {
    const notes = notesRef.current;
    if (notes.length === 0) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    clearPlayback();
    setIsPlaying(true);

    const startAt = ctx.currentTime + 0.03;
    const clipDuration = getDuration(notes);

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const noteStart = startAt + note.startTimeS;
      const noteDuration = Math.max(note.durationS, 0.06);
      const noteEnd = noteStart + noteDuration;
      const velocity = Math.max(0.05, Math.min(0.35, note.amplitude || 0.2));

      osc.type = "triangle";
      osc.frequency.setValueAtTime(midiToFrequency(note.midi), noteStart);

      // Very short attack/release makes playback less clicky.
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(velocity, noteStart + 0.01);
      gain.gain.setValueAtTime(velocity, Math.max(noteStart + 0.01, noteEnd - 0.02));
      gain.gain.linearRampToValueAtTime(0.0001, noteEnd);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteStart);
      osc.stop(noteEnd + 0.01);

      oscillatorsRef.current.push(osc);
      gainsRef.current.push(gain);
    }

    endTimerRef.current = window.setTimeout(() => {
      setIsPlaying(false);
      clearPlayback();
    }, Math.ceil((clipDuration + 0.1) * 1000));
  }, [clearPlayback]);

  const stop = useCallback(() => {
    clearPlayback();
    setIsPlaying(false);
  }, [clearPlayback]);

  useEffect(() => {
    return () => {
      clearPlayback();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [clearPlayback]);

  return { load, play, stop, isPlaying, duration };
}