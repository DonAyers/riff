import { useCallback, useEffect, useRef, useState } from "react";
import { Soundfont } from "smplr";
import { PROFILES, type ProfileId } from "../lib/instrumentProfiles";
import type { MappedNote } from "../lib/noteMapper";
import { extendStrumPlaybackDurations } from "../lib/guitarStrumPlayback";

const DEFAULT_INSTRUMENT = "acoustic_guitar_steel";
const GUITAR_SUSTAIN_FLOOR_S = 0.18;
const GUITAR_RELEASE_TAIL_S = 0.12;

type PlaybackNote = MappedNote & { playbackDurationS: number };

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

function getClipDuration(notes: Pick<PlaybackNote, "startTimeS" | "playbackDurationS">[]): number {
  if (notes.length === 0) return 0;
  return Math.max(...notes.map((note) => note.startTimeS + note.playbackDurationS));
}

function getVelocity(amplitude = 0.2, minVelocity = 10): number {
  return Math.max(minVelocity, Math.min(100, Math.round(amplitude * 127 * 3)));
}

export function useMidiPlayback(profileId: ProfileId = "guitar"): UseMidiPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  const notesRef = useRef<MappedNote[]>([]);
  const playbackNotesRef = useRef<PlaybackNote[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const samplerRef = useRef<Soundfont | null>(null);
  const endTimerRef = useRef<number | null>(null);

  const mapPlaybackNotes = useCallback(
    (notes: MappedNote[]): PlaybackNote[] => {
      if (notes.length === 0) return [];

      const baseDurations = notes.map((note) => getPlaybackDuration(note.durationS));

      if (profileId === "guitar") {
        const windowS = PROFILES.guitar.chordWindowS;
        if (windowS > 0) {
          const extended = extendStrumPlaybackDurations(notes, baseDurations, windowS);
          return notes.map((note, index) => ({
            ...note,
            playbackDurationS: extended[index],
          }));
        }
      }

      return notes.map((note, index) => ({
        ...note,
        playbackDurationS: baseDurations[index],
      }));
    },
    [profileId],
  );

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
      const playbackNotes = mapPlaybackNotes(notes);
      playbackNotesRef.current = playbackNotes;
      setDuration(getClipDuration(playbackNotes));
      clearPlayback();
      setIsPlaying(false);
      // Initialize sampler in the background when mapped
      getSampler();
    },
    [clearPlayback, getSampler, mapPlaybackNotes],
  );

  const play = useCallback(async () => {
    const playbackNotes = playbackNotesRef.current;
    if (playbackNotes.length === 0) return;

    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    clearPlayback();
    setIsPlaying(true);

    const sampler = getSampler();
    await sampler.load; // wait for instrument to be loaded if not already

    const startAt = ctx.currentTime + 0.03;
    const clipDuration = getClipDuration(playbackNotes);

    for (const note of playbackNotes) {
      const velocity = getVelocity(note.amplitude);

      sampler.start({
        note: note.midi,
        velocity,
        time: startAt + note.startTimeS,
        duration: note.playbackDurationS,
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

  useEffect(() => {
    if (notesRef.current.length === 0) return;
    const playbackNotes = mapPlaybackNotes(notesRef.current);
    playbackNotesRef.current = playbackNotes;
    setDuration(getClipDuration(playbackNotes));
  }, [mapPlaybackNotes]);

  return { load, play, previewNote, stop, isPlaying, duration };
}
