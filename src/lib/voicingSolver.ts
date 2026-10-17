import { lookupVoicings, type GuitarVoicing } from "./chordVoicings";

/**
 * Works out which strings and frets a strum was most likely played on, from the exact
 * pitches Basic Pitch heard. This is the classic "optimum path" tablature approach
 * (Sayegh 1989): enumerate playable string/fret assignments, score them for ease of
 * playing, then pick a path through a chord sequence that avoids big position jumps.
 *
 * See research/spike-chord-voicing.md for background and trade-offs.
 */

type Frets = GuitarVoicing["frets"];

/** Open-string MIDI notes, low E (string 6) first, matching GuitarVoicing.frets order. */
export const STANDARD_TUNING_MIDI: readonly number[] = [40, 45, 50, 55, 59, 64];

export interface HeardNote {
  midi: number;
  amplitude: number;
}

export interface VoicingCandidate {
  voicing: GuitarVoicing;
  /** Lower is more likely. */
  cost: number;
  /** Heard notes this shape does not contain. */
  missing: number;
  /** Notes this shape contains that were not heard (often a string Basic Pitch missed). */
  unheard: number;
}

const STRING_COUNT = 6;
const MAX_FRET = 15;
const MAX_FRET_SPAN = 4;
const MAX_FINGERS = 4;
const MAX_HEARD_NOTES = STRING_COUNT;
const CANDIDATES_PER_CHORD = 5;

const COST = {
  spanPerFret: 0.6,
  stretch: 2,
  positionPerFret: 0.12,
  perFrettedNote: 0.25,
  barre: 0.8,
  mutedInsideChord: 2.5,
  missingNote: 2,
  missingLoudNote: 2,
  missingHarmonic: 0.75,
  unheardNote: 1.5,
  // An octave doubling is often masked by the lower note, so a missing one is cheap.
  unheardDoubling: 0.5,
  knownShapeBonus: 1,
  positionShiftPerFret: 0.35,
} as const;

export function voicingMidiNotes(frets: readonly number[], tuning: readonly number[] = STANDARD_TUNING_MIDI): number[] {
  return frets.flatMap((fret, string) => (fret < 0 ? [] : [tuning[string] + fret]));
}

interface FretStats {
  fretted: { string: number; fret: number }[];
  minFret: number;
  maxFret: number;
}

function fretStats(frets: readonly number[]): FretStats {
  const fretted = frets.flatMap((fret, string) => (fret > 0 ? [{ string, fret }] : []));
  const fretValues = fretted.map((note) => note.fret);
  return {
    fretted,
    minFret: fretted.length > 0 ? Math.min(...fretValues) : 0,
    maxFret: fretted.length > 0 ? Math.max(...fretValues) : 0,
  };
}

/** Whether the shape needs a barre, or null when one hand cannot play it at all. */
function needsBarre(frets: readonly number[]): boolean | null {
  const { fretted, minFret } = fretStats(frets);
  if (fretted.length <= MAX_FINGERS) return false;

  const barreStrings = fretted.filter((note) => note.fret === minFret).map((note) => note.string);
  if (barreStrings.length < 2) return null;

  const fingersAboveBarre = fretted.length - barreStrings.length;
  if (1 + fingersAboveBarre > MAX_FINGERS) return null;

  // A barre presses every string from its lowest one upward, so nothing under it can ring open.
  const firstBarreString = Math.min(...barreStrings);
  const openUnderBarre = frets.some((fret, string) => string > firstBarreString && fret === 0);
  return openUnderBarre ? null : true;
}

/** How hard a shape is to play; null means it is not playable by one hand. */
export function scorePlayability(frets: readonly number[]): number | null {
  const { fretted, minFret, maxFret } = fretStats(frets);
  const span = maxFret - minFret;
  if (span > MAX_FRET_SPAN) return null;

  const barre = needsBarre(frets);
  if (barre === null) return null;

  const sounding = frets.flatMap((fret, string) => (fret >= 0 ? [string] : []));
  const mutedInside = sounding.length > 0
    ? frets.filter((fret, string) => fret < 0 && string > sounding[0] && string < sounding[sounding.length - 1]).length
    : 0;

  return (
    span * COST.spanPerFret +
    (span === MAX_FRET_SPAN ? COST.stretch : 0) +
    minFret * COST.positionPerFret +
    fretted.length * COST.perFrettedNote +
    (barre ? COST.barre : 0) +
    mutedInside * COST.mutedInsideChord
  );
}

function toVoicing(frets: Frets): GuitarVoicing {
  const { fretted, minFret, maxFret } = fretStats(frets);
  const barre = needsBarre(frets) === true;
  const fingers: Frets = [0, 0, 0, 0, 0, 0];

  const ordered = [...fretted].sort((a, b) => a.fret - b.fret || a.string - b.string);
  let nextFinger = 1;
  if (barre) {
    for (const note of ordered) {
      if (note.fret === minFret) fingers[note.string] = 1;
    }
    nextFinger = 2;
  }
  for (const note of ordered) {
    if (fingers[note.string] === 0) fingers[note.string] = nextFinger++;
  }

  return {
    frets,
    fingers,
    barres: barre ? [minFret] : [],
    baseFret: maxFret <= MAX_FRET_SPAN ? 1 : minFret,
  };
}

/** Every way to put each note on its own string within reach of the nut. */
function enumerateAssignments(midis: readonly number[], tuning: readonly number[]): Frets[] {
  const results: Frets[] = [];
  const frets: Frets = [-1, -1, -1, -1, -1, -1];

  const place = (noteIndex: number) => {
    if (noteIndex === midis.length) {
      results.push([...frets] as Frets);
      return;
    }
    for (let string = 0; string < STRING_COUNT; string += 1) {
      const fret = midis[noteIndex] - tuning[string];
      if (frets[string] !== -1 || fret < 0 || fret > MAX_FRET) continue;
      frets[string] = fret;
      place(noteIndex + 1);
      frets[string] = -1;
    }
  };

  place(0);
  return results;
}

/**
 * Semitones from a string's fundamental to its 2nd, 3rd, 4th, 5th, 6th and 8th harmonics:
 * the overtones Basic Pitch most often reports as extra notes.
 */
export const HARMONIC_INTERVALS: readonly number[] = [12, 19, 24, 28, 31, 36];
/**
 * The 2nd, 3rd and 4th harmonics only: the strongest partials of a plucked string. The 5th and
 * 6th land on a chord's own third and fifth, so treating them as ghosts would strip real chord tones.
 */
export const STRONG_HARMONIC_INTERVALS: readonly number[] = [12, 19, 24];
/** Real doubled notes in a strum ring about as loud as the note below; overtones are clearly quieter. */
const HARMONIC_MAX_RELATIVE_AMPLITUDE = 0.75;

export interface OvertoneOptions {
  intervals?: readonly number[];
  maxRelativeAmplitude?: number;
}

/** True when a note is probably an overtone of a louder, lower note rather than a played string. */
export function isLikelyOvertone(
  note: HeardNote,
  others: readonly HeardNote[],
  { intervals = HARMONIC_INTERVALS, maxRelativeAmplitude = HARMONIC_MAX_RELATIVE_AMPLITUDE }: OvertoneOptions = {},
): boolean {
  return others.some((lower) =>
    intervals.includes(note.midi - lower.midi) && note.amplitude < lower.amplitude * maxRelativeAmplitude,
  );
}

interface HeardCandidateNote extends HeardNote {
  likelyHarmonic: boolean;
}

function prepareHeardNotes(notes: readonly HeardNote[]): HeardCandidateNote[] {
  const loudestByMidi = new Map<number, HeardNote>();
  for (const note of notes) {
    const existing = loudestByMidi.get(note.midi);
    if (!existing || note.amplitude > existing.amplitude) loudestByMidi.set(note.midi, note);
  }

  const unique = [...loudestByMidi.values()];
  const withHarmonicFlag = unique.map((note) => ({
    ...note,
    likelyHarmonic: isLikelyOvertone(note, unique),
  }));

  // Six strings means at most six notes; keep real-sounding notes ahead of probable overtones.
  return withHarmonicFlag
    .sort((a, b) => Number(a.likelyHarmonic) - Number(b.likelyHarmonic) || b.amplitude - a.amplitude)
    .slice(0, MAX_HEARD_NOTES)
    .sort((a, b) => a.midi - b.midi);
}

/**
 * Rank the shapes that could have produced these notes.
 * Candidates come from two places: direct string assignments of the heard notes (allowing one
 * note to be a detection ghost), and known shapes for the detected chord (allowing strings
 * Basic Pitch did not hear). Each is scored on playability plus how well it explains the notes.
 */
export function solveVoicing(
  notes: readonly HeardNote[],
  chordSymbol?: string | null,
  tuning: readonly number[] = STANDARD_TUNING_MIDI,
): VoicingCandidate[] {
  const heard = prepareHeardNotes(notes);
  if (heard.length === 0) return [];

  const loudest = Math.max(...heard.map((note) => note.amplitude), Number.EPSILON);
  const missingCost = (note: HeardCandidateNote) => note.likelyHarmonic
    ? COST.missingHarmonic
    : COST.missingNote + COST.missingLoudNote * (note.amplitude / loudest);
  const heardChromas = new Set(heard.map((note) => note.midi % 12));
  const best = new Map<string, VoicingCandidate>();

  const consider = (frets: Frets, isKnownShape: boolean) => {
    const playability = scorePlayability(frets);
    if (playability === null) return;

    const shapeMidis = new Set(voicingMidiNotes(frets, tuning));
    const heardMidis = new Set(heard.map((note) => note.midi));
    const missingNotes = heard.filter((note) => !shapeMidis.has(note.midi));
    const unheardMidis = [...shapeMidis].filter((midi) => !heardMidis.has(midi));
    const unheard = unheardMidis.length;
    const unheardCost = unheardMidis.reduce(
      (total, midi) => total + (heardChromas.has(midi % 12) ? COST.unheardDoubling : COST.unheardNote),
      0,
    );
    if (missingNotes.length === heard.length) return;

    const cost =
      playability +
      missingNotes.reduce((total, note) => total + missingCost(note), 0) +
      unheardCost -
      (isKnownShape ? COST.knownShapeBonus : 0);

    const key = frets.join(",");
    const existing = best.get(key);
    if (!existing || cost < existing.cost) {
      best.set(key, { voicing: toVoicing(frets), cost, missing: missingNotes.length, unheard });
    }
  };

  const heardMidis = heard.map((note) => note.midi);
  for (const frets of enumerateAssignments(heardMidis, tuning)) consider(frets, false);

  // A stray overtone or sympathetic string can make the real shape look unplayable.
  if (heardMidis.length >= 4) {
    heardMidis.forEach((_, skipIndex) => {
      const subset = heardMidis.filter((__, index) => index !== skipIndex);
      for (const frets of enumerateAssignments(subset, tuning)) consider(frets, false);
    });
  }
  const withoutHarmonics = heard.filter((note) => !note.likelyHarmonic).map((note) => note.midi);
  if (withoutHarmonics.length > 0 && withoutHarmonics.length < heardMidis.length) {
    for (const frets of enumerateAssignments(withoutHarmonics, tuning)) consider(frets, false);
  }

  // Known shapes assume standard tuning, so only use them there.
  const isStandardTuning = tuning.every((midi, index) => midi === STANDARD_TUNING_MIDI[index]);
  if (chordSymbol && isStandardTuning) {
    for (const known of lookupVoicings(chordSymbol)) consider(known.frets, true);
  }

  return [...best.values()].sort((a, b) => a.cost - b.cost);
}

function neckPosition(frets: readonly number[]): number {
  const { fretted } = fretStats(frets);
  if (fretted.length === 0) return 0;
  return fretted.reduce((total, note) => total + note.fret, 0) / fretted.length;
}

/**
 * Pick one shape per chord so the whole progression is easy to play (Viterbi over the
 * top candidates of each chord). Chords with no candidates come back as null.
 */
export function chooseVoicingPath(candidatesPerChord: readonly (readonly VoicingCandidate[])[]): (VoicingCandidate | null)[] {
  const path: (VoicingCandidate | null)[] = [];
  let segment: VoicingCandidate[][] = [];

  const flushSegment = () => {
    if (segment.length === 0) return;

    const totals: number[][] = [segment[0].map((candidate) => candidate.cost)];
    const previous: number[][] = [segment[0].map(() => -1)];

    for (let step = 1; step < segment.length; step += 1) {
      totals[step] = [];
      previous[step] = [];
      segment[step].forEach((candidate, index) => {
        let bestTotal = Infinity;
        let bestPrevious = 0;
        segment[step - 1].forEach((prior, priorIndex) => {
          const shift = Math.abs(neckPosition(candidate.voicing.frets) - neckPosition(prior.voicing.frets));
          const total = totals[step - 1][priorIndex] + shift * COST.positionShiftPerFret;
          if (total < bestTotal) {
            bestTotal = total;
            bestPrevious = priorIndex;
          }
        });
        totals[step][index] = bestTotal + candidate.cost;
        previous[step][index] = bestPrevious;
      });
    }

    const last = totals[totals.length - 1];
    let index = last.indexOf(Math.min(...last));
    const chosen: VoicingCandidate[] = [];
    for (let step = segment.length - 1; step >= 0; step -= 1) {
      chosen[step] = segment[step][index];
      index = previous[step][index];
    }

    path.push(...chosen);
    segment = [];
  };

  for (const candidates of candidatesPerChord) {
    if (candidates.length === 0) {
      flushSegment();
      path.push(null);
      continue;
    }
    segment.push(candidates.slice(0, CANDIDATES_PER_CHORD));
  }
  flushSegment();

  return path;
}
