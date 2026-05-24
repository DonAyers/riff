import { Chord, Note } from "tonal";
import { buildStrumClusters, type NoteStrumCluster } from "./guitarStrumPlayback";
import type { MappedNote } from "./noteMapper";

export interface ChordEvent {
  chord: string;
  label: string;
  startTimeS: number;
  endTimeS: number;
}

type PitchClassWeights = Map<string, number>;

interface DetectChordOptions {
  bassPitchClass?: string;
  weights?: PitchClassWeights;
}

interface ChordCandidate {
  symbol: string;
  index: number;
  isFallback: boolean;
}

function pitchClassChroma(pitchClass: string | null | undefined): number | null {
  if (!pitchClass) return null;
  const chroma = Note.chroma(pitchClass);
  return typeof chroma === "number" ? chroma : null;
}

function samePitchClass(a: string | null | undefined, b: string | null | undefined): boolean {
  const aChroma = pitchClassChroma(a);
  const bChroma = pitchClassChroma(b);
  return aChroma !== null && bChroma !== null && aChroma === bChroma;
}

function semitonesBetween(from: string, to: string): number | null {
  const fromChroma = pitchClassChroma(from);
  const toChroma = pitchClassChroma(to);
  if (fromChroma === null || toChroma === null) return null;
  return (toChroma - fromChroma + 12) % 12;
}

function uniquePitchClasses(pitchClasses: readonly string[]): string[] {
  const seen = new Set<number>();
  const unique: string[] = [];

  for (const pitchClass of pitchClasses) {
    const chroma = pitchClassChroma(pitchClass);
    if (chroma === null || seen.has(chroma)) continue;
    seen.add(chroma);
    unique.push(pitchClass);
  }

  return unique;
}

function getPitchClassWeight(weights: PitchClassWeights | undefined, pitchClass: string | null | undefined): number {
  const targetChroma = pitchClassChroma(pitchClass);
  if (!weights || targetChroma === null) return 0;

  let total = 0;
  for (const [weightedPitchClass, weight] of weights) {
    if (pitchClassChroma(weightedPitchClass) === targetChroma) {
      total += weight;
    }
  }

  return total;
}

function buildPitchClassWeights(notes: readonly MappedNote[]): PitchClassWeights {
  const weights: PitchClassWeights = new Map();

  for (const note of notes) {
    weights.set(note.pitchClass, (weights.get(note.pitchClass) ?? 0) + note.amplitude);
  }

  return weights;
}

function noteEndTimeS(note: MappedNote): number {
  return note.startTimeS + note.durationS;
}

function clusterOnsetRange(cluster: NoteStrumCluster, notes: readonly MappedNote[]) {
  const onsets = cluster.noteIndices.map((index) => notes[index].startTimeS);
  return {
    startTimeS: Math.min(...onsets),
    endTimeS: Math.max(...onsets),
  };
}

function buildChordContextNotes(
  notes: readonly MappedNote[],
  cluster: NoteStrumCluster,
  windowS: number,
): MappedNote[] {
  const clusterIndices = new Set(cluster.noteIndices);
  const { startTimeS } = clusterOnsetRange(cluster, notes);
  const contextWindowS = Math.max(windowS * 2.5, 0.34);

  return notes.filter((note, index) => {
    if (clusterIndices.has(index)) return true;

    const onsetDistanceS = Math.abs(note.startTimeS - startTimeS);
    if (onsetDistanceS > contextWindowS) return false;

    return noteEndTimeS(note) >= startTimeS;
  });
}

function lowestPitchClass(notes: readonly MappedNote[]): string | undefined {
  return notes.reduce<MappedNote | null>((lowest, note) => {
    if (!lowest || note.midi < lowest.midi) return note;
    return lowest;
  }, null)?.pitchClass;
}

function sortByWeight(pitchClasses: readonly string[], weights: PitchClassWeights | undefined): string[] {
  return [...pitchClasses].sort((a, b) => getPitchClassWeight(weights, b) - getPitchClassWeight(weights, a));
}

function prioritizeBassPitchClass(pitchClasses: readonly string[], bassPitchClass?: string): string[] {
  if (!bassPitchClass) return [...pitchClasses];

  const bass = pitchClasses.find((pitchClass) => samePitchClass(pitchClass, bassPitchClass));
  if (!bass) return [...pitchClasses];

  return [bass, ...pitchClasses.filter((pitchClass) => !samePitchClass(pitchClass, bass))];
}

function pitchClassRotations(pitchClasses: readonly string[]): string[][] {
  return pitchClasses.map((_, index) => [
    ...pitchClasses.slice(index),
    ...pitchClasses.slice(0, index),
  ]);
}

function addCandidates(
  candidates: ChordCandidate[],
  symbols: readonly string[],
  isFallback: boolean,
): void {
  for (const symbol of symbols) {
    if (candidates.some((candidate) => candidate.symbol === symbol)) continue;
    candidates.push({ symbol, index: candidates.length, isFallback });
  }
}

function detectPowerChord(pitchClasses: readonly string[], bassPitchClass?: string): string | null {
  const unique = uniquePitchClasses(pitchClasses);
  if (unique.length !== 2) return null;

  const bass = bassPitchClass && unique.some((pitchClass) => samePitchClass(pitchClass, bassPitchClass))
    ? unique.find((pitchClass) => samePitchClass(pitchClass, bassPitchClass))!
    : unique[0];
  const other = unique.find((pitchClass) => !samePitchClass(pitchClass, bass));
  if (!other) return null;

  const interval = semitonesBetween(bass, other);
  if (interval === 7) return `${bass}5`;
  if (interval === 5) return `${other}5/${bass}`;
  return null;
}

function chordToneWeight(symbol: string, weights: PitchClassWeights | undefined): number {
  const chord = Chord.get(symbol);
  if (chord.empty) return 0;

  const seen = new Set<number>();
  return chord.notes.reduce((total, note) => {
    const chroma = pitchClassChroma(note);
    if (chroma === null || seen.has(chroma)) return total;
    seen.add(chroma);
    return total + getPitchClassWeight(weights, note);
  }, 0);
}

function candidateQualityPenalty(symbol: string): number {
  const chord = Chord.get(symbol);
  const type = chord.type.toLowerCase();
  if (chord.quality === "Augmented" || chord.quality === "Diminished") return 3;
  if (type.includes("altered") || symbol.includes("#") || symbol.includes("b")) return 2;
  if (chord.quality === "Major" || chord.quality === "Minor") return 0;
  if (chord.quality === "Unknown") return 1;
  return 1;
}

function rankCandidates(
  candidates: readonly ChordCandidate[],
  options: DetectChordOptions,
): ChordCandidate[] {
  return [...candidates].sort((a, b) => {
    const aChord = Chord.get(a.symbol);
    const bChord = Chord.get(b.symbol);
    const aSlash = a.symbol.includes("/");
    const bSlash = b.symbol.includes("/");
    const aTonicMatchesBass = samePitchClass(aChord.tonic, options.bassPitchClass);
    const bTonicMatchesBass = samePitchClass(bChord.tonic, options.bassPitchClass);
    const tier = (candidate: ChordCandidate, isSlash: boolean, tonicMatchesBass: boolean) => {
      const fallbackPenalty = candidate.isFallback ? 3 : 0;
      if (!isSlash && tonicMatchesBass) return fallbackPenalty;
      if (!isSlash) return fallbackPenalty + 1;
      return fallbackPenalty + 2;
    };

    const tierDelta = tier(a, aSlash, aTonicMatchesBass) - tier(b, bSlash, bTonicMatchesBass);
    if (tierDelta !== 0) return tierDelta;

    const qualityDelta = candidateQualityPenalty(a.symbol) - candidateQualityPenalty(b.symbol);
    if (qualityDelta !== 0) return qualityDelta;

    const tonicWeightDelta =
      getPitchClassWeight(options.weights, bChord.tonic) -
      getPitchClassWeight(options.weights, aChord.tonic);
    if (tonicWeightDelta !== 0) return tonicWeightDelta;

    const toneWeightDelta = chordToneWeight(b.symbol, options.weights) - chordToneWeight(a.symbol, options.weights);
    if (toneWeightDelta !== 0) return toneWeightDelta;

    return a.index - b.index;
  });
}

/**
 * Given an array of pitch class strings (e.g. ["C", "E", "G"]),
 * detect the most likely chord name.
 */
export function detectChord(pitchClasses: string[], options: DetectChordOptions = {}): string | null {
  const unique = uniquePitchClasses(pitchClasses);
  if (unique.length < 2) return null;
  const ordered = prioritizeBassPitchClass(unique, options.bassPitchClass);

  const candidates: ChordCandidate[] = [];
  const powerChord = detectPowerChord(unique, options.bassPitchClass);
  if (powerChord) {
    addCandidates(candidates, [powerChord], false);
  }

  addCandidates(candidates, Chord.detect(ordered), false);
  if (!options.bassPitchClass) {
    for (const rotation of pitchClassRotations(unique)) {
      addCandidates(candidates, Chord.detect(rotation), false);
    }
  }

  if (candidates.length === 0) {
    const weightedPitchClasses = sortByWeight(unique, options.weights);
    const fallbackSizes = [...new Set([Math.min(4, weightedPitchClasses.length), Math.min(3, weightedPitchClasses.length)])]
      .filter((size) => size >= 2);
    for (const fallbackSize of fallbackSizes) {
      addCandidates(
        candidates,
        Chord.detect(
          prioritizeBassPitchClass(weightedPitchClasses.slice(0, fallbackSize), options.bassPitchClass),
          { assumePerfectFifth: true },
        ),
        true,
      );
      if (candidates.length > 0) break;
    }
  }

  if (candidates.length === 0) return null;

  return rankCandidates(candidates, options)[0].symbol;
}

/**
 * Group nearby note onsets into time clusters and detect a chord per cluster.
 * Returns the chord from the cluster with the most notes (dominant chord).
 * When windowS is 0, falls back to the original whole-recording behaviour.
 */
export function detectChordTimeline(notes: MappedNote[], windowS: number): ChordEvent[] {
  if (notes.length === 0) return [];

  // No windowing — fall back to pooling all pitch classes
  if (windowS <= 0) {
    const pitchClasses = uniquePitchClasses(notes.map((n) => n.pitchClass));
    const detected = detectChord(pitchClasses, {
      bassPitchClass: lowestPitchClass(notes),
      weights: buildPitchClassWeights(notes),
    });
    if (!detected) return [];
    const startTimeS = Math.min(...notes.map((note) => note.startTimeS));
    const endTimeS = Math.max(...notes.map((note) => note.startTimeS + note.durationS));
    return [{ chord: detected, label: formatChordName(detected), startTimeS, endTimeS }];
  }

  const clusters = buildStrumClusters(notes, windowS);

  return clusters.flatMap((cluster) => {
    const clusterNotes = cluster.noteIndices.map((index) => notes[index]);
    const contextNotes = buildChordContextNotes(notes, cluster, windowS);
    const pitchClasses = uniquePitchClasses(contextNotes.map((n) => n.pitchClass));
    const chord = detectChord(pitchClasses, {
      bassPitchClass: lowestPitchClass(contextNotes),
      weights: buildPitchClassWeights(contextNotes),
    });
    if (!chord) return [];

    const startTimeS = Math.min(...clusterNotes.map((note) => note.startTimeS));
    const endTimeS = Math.max(...contextNotes.map(noteEndTimeS));

    return [{
      chord,
      label: formatChordName(chord),
      startTimeS,
      endTimeS,
    }];
  });
}

/**
 * Backward-compatible summary API: returns the chord from the largest cluster.
 */
export function detectChordsWindowed(
  notes: MappedNote[],
  windowS: number,
): string | null {
  const events = detectChordTimeline(notes, windowS);
  if (events.length === 0) return null;

  const largest = events.reduce((best, current) => {
    const currentSpan = current.endTimeS - current.startTimeS;
    const bestSpan = best.endTimeS - best.startTimeS;
    return currentSpan > bestSpan ? current : best;
  });

  return largest.chord;
}

/**
 * Return a human-friendly chord label.
 * e.g. "CM" → "C Major", "Am" → "A minor", etc.
 * Falls back to the raw symbol if no nice name is found.
 */
export function formatChordName(symbol: string): string {
  const chord = Chord.get(symbol);
  if (chord.empty) return symbol;

  const root = chord.tonic ?? "";
  const rawAliases = chord.aliases;
  const aliases = chord.aliases.map((alias) => alias.toLowerCase());
  const normalizedSymbol = chord.symbol.toLowerCase();
  const type = chord.type.toLowerCase();

  let label: string;
  if (aliases.includes("maj7")) label = "major 7";
  else if (aliases.includes("m11")) label = "minor 11";
  else if (aliases.includes("m9")) label = "minor 9";
  else if (aliases.includes("m7")) label = "minor 7";
  else if (aliases.includes("13")) label = "dominant 13";
  else if (aliases.includes("9")) label = "dominant 9";
  else if (aliases.includes("7") || aliases.includes("dom")) label = "dominant 7";
  else if (aliases.includes("7sus4") || aliases.includes("7sus")) label = "dominant 7 sus4";
  else if (aliases.includes("sus2")) label = "sus2";
  else if (aliases.includes("sus4") || aliases.includes("sus")) label = "sus4";
  else if (aliases.includes("add9") || aliases.includes("add2") || normalizedSymbol.includes("add9")) label = "add9";
  else if (rawAliases.includes("m6") || aliases.includes("-6")) label = "minor 6";
  else if (aliases.includes("6") || aliases.includes("add6")) label = "sixth";
  else if (aliases.includes("5")) label = "power chord";
  else if (chord.quality === "Diminished" || type.includes("diminished")) label = "Diminished";
  else if (chord.quality === "Augmented" || type.includes("augmented")) label = "Augmented";
  else if (chord.quality === "Minor") label = "Minor";
  else if (chord.quality === "Major") label = "Major";
  else label = chord.aliases?.[0] ?? chord.quality;

  const bass = chord.root && !samePitchClass(chord.root, chord.tonic) ? `/${chord.root}` : "";
  return `${root} ${label}${bass}`;
}
