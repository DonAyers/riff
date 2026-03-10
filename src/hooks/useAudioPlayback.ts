import { useCallback, useRef, useState } from "react";
import { encodeWav } from "../lib/audioExport";

export interface UseAudioPlaybackReturn {
  /** Call with the raw PCM Float32Array to prepare playback */
  load: (pcm: Float32Array) => void;
  /** Call with a pre-encoded audio Blob (MP3, WebM, etc.) to prepare playback */
  loadBlob: (blob: Blob) => void;
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

  const load = useCallback((pcm: Float32Array) => {
    // Revoke old URL
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }

    const blob = encodeWav(pcm);
    const url = URL.createObjectURL(blob);
    urlRef.current = url;

    const audio = new Audio(url);
    audio.onended = () => setIsPlaying(false);
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audioRef.current = audio;
    setIsPlaying(false);
  }, []);

  const loadBlob = useCallback((blob: Blob) => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
    }

    const url = URL.createObjectURL(blob);
    urlRef.current = url;

    const audio = new Audio(url);
    audio.onended = () => setIsPlaying(false);
    audio.onloadedmetadata = () => setDuration(audio.duration);
    audioRef.current = audio;
    setIsPlaying(false);
  }, []);

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

  return { load, loadBlob, play, pause, isPlaying, duration };
}
