import { useCallback, useEffect, useRef, useState } from "react";
import { encodeWav } from "../lib/audioExport";

export interface UseAudioPlaybackReturn {
  /** Call with the raw PCM Float32Array to prepare playback */
  load: (pcm: Float32Array, sampleRate?: number) => void;
  /** Call with a pre-encoded audio Blob (MP3, WebM, etc.) to prepare playback */
  loadBlob: (blob: Blob) => void;
  /** Dispose the current audio element and any associated object URL */
  reset: () => void;
  play: () => void;
  pause: () => void;
  isPlaying: boolean;
  /** Duration in seconds */
  duration: number;
}

export function useAudioPlayback(): UseAudioPlaybackReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const disposeAudioElement = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio) {
      return;
    }

    audio.pause();
    audio.onended = null;
    audio.onloadedmetadata = null;
    audio.removeAttribute("src");
    audio.load();
  }, []);

  const disposeCurrentAudio = useCallback((shouldResetState: boolean) => {
    disposeAudioElement(audioRef.current);

    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }

    audioRef.current = null;
    urlRef.current = null;
    if (shouldResetState) {
      setIsPlaying(false);
      setDuration(0);
    }
  }, [disposeAudioElement]);

  const reset = useCallback(() => {
    disposeCurrentAudio(true);
  }, [disposeCurrentAudio]);

  const attachAudio = useCallback((url: string) => {
    const audio = new Audio(url);
    audio.onended = () => setIsPlaying(false);
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audioRef.current = audio;
    setIsPlaying(false);
    setDuration(0);
  }, []);

  const load = useCallback((pcm: Float32Array, sampleRate?: number) => {
    reset();

    const blob = encodeWav(pcm, sampleRate);
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    attachAudio(url);
  }, [attachAudio, reset]);

  const loadBlob = useCallback((blob: Blob) => {
    reset();

    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    attachAudio(url);
  }, [attachAudio, reset]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play();
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
  }, []);

  useEffect(() => () => {
    disposeCurrentAudio(false);
  }, [disposeCurrentAudio]);

  return { load, loadBlob, reset, play, pause, isPlaying, duration };
}
