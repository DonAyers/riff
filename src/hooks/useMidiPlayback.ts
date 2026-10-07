import { useCallback, useEffect, useRef, useState } from "react";
import type { Soundfont } from "smplr";
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
  setLooping: (enabled: boolean) => void;
  isPlaying: boolean;
  isLooping: boolean;
  currentTimeS: number;
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
  const [isLooping, setIsLooping] = useState(false);
  const [currentTimeS, setCurrentTimeS] = useState(0);
  const [duration, setDuration] = useState(0);

  const notesRef = useRef<MappedNote[]>([]);
  const playbackNotesRef = useRef<PlaybackNote[]>([]);
  const isPlayingRef = useRef(false);
  const isLoopingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const samplerRef = useRef<Soundfont | null>(null);
  const endTimerRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackIdRef = useRef(0);

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

  // smplr loads on first playback rather than with the app (research/spike-initial-load.md).
  const samplerPromiseRef = useRef<Promise<Soundfont> | null>(null);
  const getSampler = useCallback(() => {
    if (!samplerPromiseRef.current) {
      const ctx = getAudioContext();
      samplerPromiseRef.current = import("smplr").then(({ Soundfont: SoundfontPlayer }) => {
        samplerRef.current = new SoundfontPlayer(ctx, { instrument: DEFAULT_INSTRUMENT });
        return samplerRef.current;
      });
    }
    return samplerPromiseRef.current;
  }, [getAudioContext]);

  const stopTimelineUpdates = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const clearPlayback = useCallback(() => {
    if (endTimerRef.current !== null) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }

     stopTimelineUpdates();

    if (samplerRef.current) {
      samplerRef.current.stop();
    }
  }, [stopTimelineUpdates]);

  const invalidatePlayback = useCallback(() => {
    playbackIdRef.current += 1;
    return playbackIdRef.current;
  }, []);

  const resumeAudioContext = useCallback(async (ctx: AudioContext) => {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  }, []);

  const setPlaybackPlaying = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }, []);

  const setLooping = useCallback((enabled: boolean) => {
    isLoopingRef.current = enabled;
    setIsLooping(enabled);
  }, []);

  const startTimelineUpdates = useCallback((ctx: AudioContext, playbackId: number, startAtS: number, clipDurationS: number) => {
    const update = () => {
      if (playbackId !== playbackIdRef.current) {
        return;
      }

      const elapsedS = Math.max(0, Math.min(clipDurationS, ctx.currentTime - startAtS));
      setCurrentTimeS(elapsedS);

      if (elapsedS >= clipDurationS) {
        animationFrameRef.current = null;
        return;
      }

      animationFrameRef.current = window.requestAnimationFrame(update);
    };

    stopTimelineUpdates();
    animationFrameRef.current = window.requestAnimationFrame(update);
  }, [stopTimelineUpdates]);

  const schedulePlaybackCycle = useCallback((ctx: AudioContext, playbackId: number) => {
    const playbackNotes = playbackNotesRef.current;
    if (playbackNotes.length === 0) {
      setPlaybackPlaying(false);
      setCurrentTimeS(0);
      clearPlayback();
      return;
    }

    const sampler = samplerRef.current;
    if (!sampler) return;

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

    startTimelineUpdates(ctx, playbackId, startAt, clipDuration);

    endTimerRef.current = window.setTimeout(() => {
      if (playbackId !== playbackIdRef.current) {
        return;
      }

      if (isLoopingRef.current && playbackNotesRef.current.length > 0) {
        setCurrentTimeS(0);
        schedulePlaybackCycle(ctx, playbackId);
        return;
      }

      setPlaybackPlaying(false);
      setCurrentTimeS(0);
      clearPlayback();
    }, Math.ceil((clipDuration + 0.1) * 1000));
  }, [clearPlayback, setPlaybackPlaying, startTimelineUpdates]);

  const load = useCallback(
    (notes: MappedNote[]) => {
      notesRef.current = notes;
      const playbackNotes = mapPlaybackNotes(notes);
      playbackNotesRef.current = playbackNotes;
      setDuration(getClipDuration(playbackNotes));

      if (isPlayingRef.current && isLoopingRef.current) {
        return;
      }

      invalidatePlayback();
      setCurrentTimeS(0);
      clearPlayback();
      setPlaybackPlaying(false);
    },
    [clearPlayback, invalidatePlayback, mapPlaybackNotes, setPlaybackPlaying],
  );

  const play = useCallback(async () => {
    const playbackNotes = playbackNotesRef.current;
    if (playbackNotes.length === 0) return;

    const ctx = getAudioContext();
    await resumeAudioContext(ctx);

    const playbackId = invalidatePlayback();
    clearPlayback();
    setPlaybackPlaying(true);
    setCurrentTimeS(0);

    const sampler = await getSampler();
    await sampler.load; // wait for instrument to be loaded if not already

    if (playbackId !== playbackIdRef.current) {
      return;
    }

    schedulePlaybackCycle(ctx, playbackId);
  }, [clearPlayback, getAudioContext, getSampler, invalidatePlayback, resumeAudioContext, schedulePlaybackCycle, setPlaybackPlaying]);

  const previewNote = useCallback(async (note: Pick<MappedNote, "midi" | "amplitude" | "durationS">) => {
    const ctx = getAudioContext();
    await resumeAudioContext(ctx);

    const sampler = await getSampler();

    const velocity = getVelocity(note.amplitude, 20);

    sampler.start({
      note: note.midi,
      velocity,
      time: ctx.currentTime,
      duration: getPlaybackDuration(note.durationS),
    });
  }, [getAudioContext, getSampler, resumeAudioContext]);

  const stop = useCallback(() => {
    invalidatePlayback();
    clearPlayback();
    setPlaybackPlaying(false);
    setCurrentTimeS(0);
  }, [clearPlayback, invalidatePlayback, setPlaybackPlaying]);

  useEffect(() => {
    return () => {
      invalidatePlayback();
      clearPlayback();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [clearPlayback, invalidatePlayback]);

  useEffect(() => {
    if (notesRef.current.length === 0) return;
    const playbackNotes = mapPlaybackNotes(notesRef.current);
    playbackNotesRef.current = playbackNotes;
    setDuration(getClipDuration(playbackNotes));
    setCurrentTimeS(0);
  }, [mapPlaybackNotes]);

  return { load, play, previewNote, stop, setLooping, isPlaying, isLooping, currentTimeS, duration };
}
