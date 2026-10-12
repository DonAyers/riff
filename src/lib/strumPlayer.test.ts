import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStrumPlayer } from "./strumPlayer";

const smplrStart = vi.fn();
const smplrStop = vi.fn();
vi.mock("smplr", () => ({
  Soundfont: class {
    load = Promise.resolve();
    start = smplrStart;
    stop = smplrStop;
  },
}));

class FakeParam {
  cancelScheduledValues = vi.fn();
  setTargetAtTime = vi.fn();
}

class FakeGain {
  gain = new FakeParam();
  connect = vi.fn((node) => node);
}

class FakeSource {
  buffer: unknown = null;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn((node) => node);
}

class FakeContext {
  state: AudioContextState = "suspended";
  sampleRate = 8000;
  currentTime = 1;
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  buffers = 0;
  resume = vi.fn(async () => {
    this.state = "running";
  });
  close = vi.fn(async () => {});
  createBuffer = vi.fn((_channels: number, length: number) => {
    this.buffers += 1;
    return { length, copyToChannel: vi.fn() };
  });
  createBufferSource = vi.fn(() => {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  });
  createGain = vi.fn(() => {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  });
}

const C_MAJOR = [-1, 3, 2, 0, 1, 0];

describe("createStrumPlayer", () => {
  let context: FakeContext;
  let createContext: () => AudioContext;

  beforeEach(() => {
    context = new FakeContext();
    createContext = vi.fn(() => context as unknown as AudioContext) as () => AudioContext;
    smplrStart.mockClear();
    smplrStop.mockClear();
  });

  afterEach(() => {
    delete (navigator as Navigator & { audioSession?: unknown }).audioSession;
  });

  it("creates the audio context on the first tap and resumes it inside the gesture", () => {
    const player = createStrumPlayer(createContext);
    expect(createContext).not.toHaveBeenCalled();

    player.strum(C_MAJOR);

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].start).toHaveBeenCalled();
  });

  it("chokes the ringing strum when a new one starts and reuses rendered buffers", () => {
    const player = createStrumPlayer(createContext);
    player.strum(C_MAJOR);
    player.strum(C_MAJOR);

    expect(context.buffers).toBe(1);
    expect(context.gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0, 1, expect.any(Number));
    expect(context.sources[0].stop).toHaveBeenCalled();
    expect(context.sources[1].stop).not.toHaveBeenCalled();
  });

  it("re-picking a string stops only that string", () => {
    const player = createStrumPlayer(createContext);
    player.pluck(C_MAJOR, 1);
    player.pluck(C_MAJOR, 2);
    player.pluck(C_MAJOR, 1);

    expect(context.sources[0].stop).toHaveBeenCalled();
    expect(context.sources[1].stop).not.toHaveBeenCalled();
  });

  it("ignores muted strings and all-muted shapes", () => {
    const player = createStrumPlayer(createContext);
    player.pluck(C_MAJOR, 0);
    player.strum([-1, -1, -1, -1, -1, -1]);
    expect(context.sources).toHaveLength(0);
  });

  it("asks iOS for playback audio so the silent switch does not mute it", () => {
    const audioSession = { type: "auto" };
    Object.defineProperty(navigator, "audioSession", { value: audioSession, configurable: true });

    createStrumPlayer(createContext).strum(C_MAJOR);

    expect(audioSession.type).toBe("playback");
  });

  it("leaves an explicit audio session type alone", () => {
    const audioSession = { type: "play-and-record" };
    Object.defineProperty(navigator, "audioSession", { value: audioSession, configurable: true });

    createStrumPlayer(createContext).strum(C_MAJOR);

    expect(audioSession.type).toBe("play-and-record");
  });

  it("plays the same strum through the soundfont in sample mode", async () => {
    const player = createStrumPlayer(createContext);
    player.setEngine("sample");
    player.strum(C_MAJOR, "down");

    await vi.waitFor(() => expect(smplrStart).toHaveBeenCalledTimes(5));
    const times = smplrStart.mock.calls.map(([event]) => event.time as number);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(context.sources).toHaveLength(0);
  });

  it("switching engines stops the other engine's ringing strum", async () => {
    const player = createStrumPlayer(createContext);
    player.strum(C_MAJOR);
    player.setEngine("sample");
    expect(context.sources[0].stop).toHaveBeenCalled();

    player.strum(C_MAJOR);
    await vi.waitFor(() => expect(smplrStart).toHaveBeenCalled());
    player.setEngine("synth");
    expect(smplrStop).toHaveBeenCalled();
  });

  it("drops a sampled strum still loading when a newer tap plays the synth", async () => {
    const player = createStrumPlayer(createContext);
    player.setEngine("sample");
    player.strum(C_MAJOR);
    player.setEngine("synth");
    player.strum(C_MAJOR);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(smplrStart).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(1);
  });

  it("tells subscribers when the engine changes", () => {
    const player = createStrumPlayer(createContext);
    const listener = vi.fn();
    const unsubscribe = player.subscribe(listener);

    player.setEngine("sample");
    player.setEngine("sample");
    unsubscribe();
    player.setEngine("synth");

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
