/**
 * End-to-end chord detection benchmark: renders each labelled chord shape with the
 * plucked-string synth, runs the real Basic Pitch model and Riff's guitar pipeline,
 * and scores the chord name, bass note and played shape.
 *
 * Run with `npm run benchmark:chords`. Model inference on the CPU is slow, so it is not
 * part of `npm run test`; Basic Pitch's notes are cached per case in benchmarks/results/cache
 * so tuning the post-processing re-runs in seconds. Set BENCHMARK_FRESH=1 to re-run the model.
 *
 * The truth for each case is what the shape actually sounds (its notes and lowest note),
 * so a voicing that omits a chord tone, like x32310 for C7, is still scored fairly.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Chord, Note } from "tonal";
import { expect, it } from "vitest";
import type { BasicPitch } from "@spotify/basic-pitch";
import { detectChordTimeline, dominantChordEvent } from "../src/lib/chordDetector";
import { PROFILES } from "../src/lib/instrumentProfiles";
import { filterNotes, mapNoteEvents } from "../src/lib/noteMapper";
import { renderStrum, voicingToMidi, type StrumDirection } from "../src/lib/pluckSynth";
import { loadBundledGraphModel } from "../src/workers/basicPitchModel";
import { decodeNoteEvents } from "../src/workers/noteDecoding";
import { CHORD_CASES, TUNINGS, type ChordCase } from "./chordCases";

const SAMPLE_RATE = 22050;
const MODEL_DIR = path.resolve("node_modules/@spotify/basic-pitch/model");
const REPORT_PATH = path.resolve("benchmarks/results/latest.json");
const CACHE_DIR = path.resolve("benchmarks/results/cache");
// Bump when the synth or the Basic Pitch decoding settings change.
const CACHE_VERSION = 1;

async function loadModel() {
  const fetchFile = async (url: string) => {
    const data = await readFile(url);
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(data.toString("utf8")),
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    } as unknown as Response;
  };

  return loadBundledGraphModel({
    manifestUrl: path.join(MODEL_DIR, "model.json"),
    weightUrls: [path.join(MODEL_DIR, "group1-shard1of1.bin")],
    fetchImpl: fetchFile as unknown as typeof fetch,
  });
}

async function transcribe(getBasicPitch: () => BasicPitch, audio: Float32Array, cacheKey: string) {
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
  if (!process.env.BENCHMARK_FRESH) {
    const cached = await readFile(cachePath, "utf8").catch(() => null);
    if (cached) return filterNotes(mapNoteEvents(JSON.parse(cached)), PROFILES.guitar);
  }

  const frames: number[][] = [];
  const onsets: number[][] = [];
  await getBasicPitch().evaluateModel(audio, (f, o) => {
    frames.push(...f);
    onsets.push(...o);
  }, () => {});

  const profile = PROFILES.guitar;
  const notes = decodeNoteEvents(await import("@spotify/basic-pitch"), frames, onsets, profile).map((note) => ({
    pitchMidi: note.pitchMidi,
    startTimeS: note.startTimeSeconds,
    durationS: note.durationSeconds,
    amplitude: note.amplitude,
  }));
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, JSON.stringify(notes));
  return filterNotes(mapNoteEvents(notes), profile);
}

function chromaSetOf(chromas: readonly number[]): string {
  return [...new Set(chromas)].sort((a, b) => a - b).join(",");
}

function chordChromas(symbol: string): number[] {
  return Chord.get(symbol).notes.map((note) => Note.chroma(note));
}

function bassChroma(symbol: string): number | undefined {
  const chord = Chord.get(symbol);
  return Note.chroma(chord.bass || chord.tonic || "");
}

interface CaseResult {
  name: string;
  direction: StrumDirection;
  expected: string;
  detected: string | null;
  /** Same notes, same root and same bass note. */
  correct: boolean;
  /** Same notes, bass ignored. */
  notesCorrect: boolean;
  shapeCorrect: boolean;
  /** Shapes are solved for standard tuning only, so other tunings are scored for the chord alone. */
  standardTuning: boolean;
  heard: string[];
  shape: string | null;
}

async function runCase(getBasicPitch: () => BasicPitch, chordCase: ChordCase, direction: StrumDirection): Promise<CaseResult> {
  const tuning = TUNINGS[chordCase.tuning ?? "standard"];
  const played = voicingToMidi(chordCase.frets, tuning).filter((midi): midi is number => midi !== null);
  const audio = renderStrum(voicingToMidi(chordCase.frets, tuning), SAMPLE_RATE, { direction, durationS: 2.5, seed: 7 });
  const cacheKey = `v${CACHE_VERSION}-${chordCase.tuning ?? "standard"}-${chordCase.frets.join("_")}-${direction}`;
  const notes = await transcribe(getBasicPitch, audio, cacheKey);
  const event = dominantChordEvent(detectChordTimeline(notes, PROFILES.guitar.chordWindowS));
  const detected = event?.chord ?? null;

  const playedSet = chromaSetOf(played.map((midi) => midi % 12));
  const notesCorrect = detected !== null && chromaSetOf(chordChromas(detected)) === playedSet;
  const rootCorrect = detected !== null && Note.chroma(Chord.get(detected).tonic ?? "") === Note.chroma(Chord.get(chordCase.chord).tonic ?? "");
  const correct = notesCorrect && rootCorrect && bassChroma(detected!) === Math.min(...played) % 12;
  const shape = event?.voicing ? event.voicing.frets.join(",") : null;

  return {
    name: chordCase.name,
    direction,
    expected: chordCase.chord,
    detected,
    correct,
    notesCorrect,
    shapeCorrect: shape === chordCase.frets.join(","),
    standardTuning: (chordCase.tuning ?? "standard") === "standard",
    heard: [...new Map(notes.sort((a, b) => a.midi - b.midi).map((note) => [note.name, `${note.name}:${note.amplitude.toFixed(2)}`])).values()],
    shape,
  };
}

it("scores chord detection on rendered guitar strums", async () => {
  const workerGlobal = globalThis as Record<string, unknown>;
  workerGlobal.window ??= globalThis;
  // The model itself is loaded lazily so cached runs never touch it.
  // Imported after the window alias exists, as the worker does, since the bundle can expect one.
  const { BasicPitch: BasicPitchClass } = await import("@spotify/basic-pitch");
  let basicPitch: BasicPitch | null = null;
  const getBasicPitch = () => (basicPitch ??= new BasicPitchClass(
    // Basic Pitch bundles its own copy of the tfjs types, as in the worker.
    loadModel() as unknown as ConstructorParameters<typeof BasicPitchClass>[0],
  ));

  const results: CaseResult[] = [];
  for (const chordCase of CHORD_CASES) {
    for (const direction of ["down", "up"] as const) {
      results.push(await runCase(getBasicPitch, chordCase, direction));
    }
  }

  const pct = (count: number, total = results.length) => `${((100 * count) / total).toFixed(1)}%`;
  const standard = results.filter((result) => result.standardTuning);
  const summary = {
    cases: results.length,
    correct: pct(results.filter((result) => result.correct).length),
    notesCorrect: pct(results.filter((result) => result.notesCorrect).length),
    shapeCorrectStandardTuning: pct(standard.filter((result) => result.shapeCorrect).length, standard.length),
  };

  for (const result of results.filter((entry) => !entry.correct || (entry.standardTuning && !entry.shapeCorrect))) {
    console.log(
      `${result.correct ? "  " : "✗ "}${result.name} (${result.direction}): expected ${result.expected}, got ${result.detected}` +
        ` | shape ${result.shapeCorrect ? "ok" : result.shape} | heard ${result.heard.join(" ")}`,
    );
  }
  console.log(summary);

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify({ summary, results }, null, 2)}\n`);
  expect(results.length).toBe(CHORD_CASES.length * 2);
});
