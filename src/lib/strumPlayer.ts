import type { Soundfont } from "smplr";
import {
  renderNote,
  renderStrum,
  strumOffsets,
  voicingToMidi,
  type StrumDirection,
} from "./pluckSynth";

// Plays chord shapes as strums. "synth" renders with pluckSynth (no download,
// works offline); "sample" plays the same strum timing through the existing
// smplr steel-guitar soundfont so the two can be compared by ear.
export type StrumEngine = "synth" | "sample";

export interface StrumPlayer {
  strum: (frets: readonly number[], direction?: StrumDirection) => void;
  pluck: (frets: readonly number[], stringIndex: number) => void;
  setEngine: (engine: StrumEngine) => void;
  getEngine: () => StrumEngine;
  /** Calls `listener` when the engine changes; returns an unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
}

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

const CHOKE_TIME_CONSTANT_S = 0.012;
const CACHE_LIMIT = 48;
const SAMPLE_INSTRUMENT = "acoustic_guitar_steel";

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

function preferPlaybackSession() {
  // iOS mutes Web Audio under the silent switch while the session type is
  // "auto"/"ambient". Leave any explicit choice (the looper's
  // "play-and-record") alone.
  const audioSession = (navigator as AudioSessionNavigator).audioSession;
  if (audioSession && audioSession.type === "auto") {
    try {
      audioSession.type = "playback";
    } catch {
      // Older WebKit rejects unknown values; nothing to do.
    }
  }
}

export function createStrumPlayer(
  createContext: () => AudioContext = () => new AudioContext({ latencyHint: "interactive" }),
): StrumPlayer {
  let context: AudioContext | null = null;
  let engine: StrumEngine = "synth";
  let strumVoice: Voice | null = null;
  const stringVoices = new Map<number, Voice>();
  const cache = new Map<string, AudioBuffer>();
  let samplerPromise: Promise<Soundfont> | null = null;
  let loadedSampler: Soundfont | null = null;
  // Bumped on every play so a sampled strum still loading never starts late.
  let playRequest = 0;
  const listeners = new Set<() => void>();

  // Must run inside the click handler: iOS only unlocks audio from a gesture.
  function getContext(): AudioContext {
    if (!context) {
      preferPlaybackSession();
      context = createContext();
    }
    if (context.state === "suspended") {
      void context.resume();
    }
    return context;
  }

  function cached(key: string, render: (sampleRate: number) => Float32Array): AudioBuffer {
    const ctx = getContext();
    const hit = cache.get(key);
    if (hit) {
      // Refresh recency for the LRU.
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const samples = render(ctx.sampleRate);
    const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    cache.set(key, buffer);
    if (cache.size > CACHE_LIMIT) {
      cache.delete(cache.keys().next().value as string);
    }
    return buffer;
  }

  function choke(voice: Voice | null | undefined) {
    if (!voice || !context) return;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, CHOKE_TIME_CONSTANT_S);
    try {
      voice.source.stop(now + CHOKE_TIME_CONSTANT_S * 8);
    } catch {
      // Already stopped.
    }
  }

  function start(buffer: AudioBuffer): Voice {
    const ctx = getContext();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime + 0.005);
    return { source, gain };
  }

  function chokeAll() {
    choke(strumVoice);
    strumVoice = null;
    stringVoices.forEach((voice) => choke(voice));
    stringVoices.clear();
  }

  function getSampler(ctx: AudioContext): Promise<Soundfont> {
    if (!samplerPromise) {
      samplerPromise = import("smplr")
        .then(({ Soundfont: SoundfontPlayer }) => {
          const sampler = new SoundfontPlayer(ctx, { instrument: SAMPLE_INSTRUMENT });
          return sampler.load.then(() => {
            loadedSampler = sampler;
            return sampler;
          });
        })
        .catch((error: unknown) => {
          samplerPromise = null;
          throw error;
        });
    }
    return samplerPromise;
  }

  // Stops whatever is ringing on either engine before a new strum or pick.
  function stopEverything() {
    playRequest += 1;
    chokeAll();
    loadedSampler?.stop();
  }

  function playSampled(notes: Array<number | null>, offsets: Array<number | null>) {
    const ctx = getContext();
    stopEverything();
    const request = playRequest;
    void getSampler(ctx).then((sampler) => {
      if (request !== playRequest) return;
      const at = ctx.currentTime + 0.01;
      notes.forEach((midi, index) => {
        const offset = offsets[index];
        if (midi === null || offset === null) return;
        sampler.start({ note: midi, velocity: 90 - index * 2, time: at + offset, duration: 2.4 });
      });
    }).catch(() => {
      // Offline or blocked CDN: the synth engine still works.
    });
  }

  return {
    strum(frets, direction = "down") {
      const notes = voicingToMidi(frets);
      if (notes.every((midi) => midi === null)) return;
      if (engine === "sample") {
        playSampled(notes, strumOffsets(notes, direction));
        return;
      }
      const buffer = cached(`strum:${frets.join(",")}:${direction}`, (sampleRate) =>
        renderStrum(notes, sampleRate, { direction }),
      );
      stopEverything();
      strumVoice = start(buffer);
    },
    pluck(frets, stringIndex) {
      const midi = voicingToMidi(frets)[stringIndex];
      if (midi === null || midi === undefined) return;
      if (engine === "sample") {
        const single = voicingToMidi(frets).map((value, index) => (index === stringIndex ? value : null));
        playSampled(single, single.map((value) => (value === null ? null : 0)));
        return;
      }
      const buffer = cached(`note:${midi}`, (sampleRate) => renderNote(midi, sampleRate));
      // A new pick on the same string stops the old vibration; others ring on.
      playRequest += 1;
      loadedSampler?.stop();
      choke(stringVoices.get(stringIndex));
      stringVoices.set(stringIndex, start(buffer));
    },
    setEngine(next) {
      if (next === engine) return;
      stopEverything();
      engine = next;
      listeners.forEach((listener) => listener());
    },
    getEngine() {
      return engine;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      stopEverything();
      listeners.clear();
      cache.clear();
      void context?.close().catch(() => {});
      context = null;
    },
  };
}

let shared: StrumPlayer | null = null;

/** One player (and one AudioContext) for every fretboard on the page. */
export function getStrumPlayer(): StrumPlayer {
  shared ??= createStrumPlayer();
  return shared;
}
