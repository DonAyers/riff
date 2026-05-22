import { Chord, Key, Note } from "tonal";
import { formatChordName } from "./chordDetector";

export type ChordSuggestionCategory = "variate" | "spice-up" | "spice-down" | "phrasing";

export type ParsedChordQuality = "major" | "minor" | "dominant";

export interface ParsedSuggestedChord {
  input: string;
  symbol: string;
  tonic: string;
  quality: ParsedChordQuality;
}

export interface ChordSuggestion {
  id: string;
  category: ChordSuggestionCategory;
  chord: string;
  displayName: string;
  description: string;
  relationship: string;
}

export interface ChordSuggestionOptions {
  categories?: ChordSuggestionCategory[];
  limitPerCategory?: number;
}

export interface ChordSuggestionResult {
  input: string | null;
  parsed: ParsedSuggestedChord | null;
  suggestions: ChordSuggestion[];
  unsupportedReason?: string;
}

const CATEGORY_ORDER: ChordSuggestionCategory[] = ["variate", "spice-up", "spice-down", "phrasing"];

function normalizeCommonChordLabel(chordName: string): string {
  const trimmed = chordName.trim().replace(/♭/g, "b").replace(/♯/g, "#").replace(/\s+/g, " ");
  const labelMatch = trimmed.match(/^([A-G](?:#|b)?)[\s-]+(.+)$/);

  if (!labelMatch) {
    return trimmed;
  }

  const [, tonic, qualityLabel] = labelMatch;
  const quality = qualityLabel.toLowerCase();
  const qualityMap: Record<string, string> = {
    major: "M",
    maj: "M",
    minor: "m",
    min: "m",
    "major 7": "maj7",
    major7: "maj7",
    maj7: "maj7",
    "minor 7": "m7",
    minor7: "m7",
    min7: "m7",
    m7: "m7",
    "dominant 7": "7",
    dominant7: "7",
    "7": "7",
    diminished: "dim",
    dim: "dim",
    augmented: "aug",
    aug: "aug",
    "suspended 2": "sus2",
    sus2: "sus2",
    "suspended 4": "sus4",
    suspended: "sus4",
    sus: "sus4",
    sus4: "sus4",
  };

  const suffix = qualityMap[quality];
  return suffix ? `${tonic}${suffix}` : trimmed;
}

function parseChord(chordName: string | null): ParsedSuggestedChord | null {
  if (!chordName?.trim()) {
    return null;
  }

  const normalized = normalizeCommonChordLabel(chordName);
  const chord = Chord.get(normalized);

  if (chord.empty || !chord.tonic) {
    return null;
  }

  const aliases = chord.aliases.map((alias) => alias.toLowerCase());
  const isDominant = aliases.includes("7") || aliases.includes("dom");

  if (isDominant) {
    return { input: chordName, symbol: chord.symbol, tonic: chord.tonic, quality: "dominant" };
  }

  if (chord.quality === "Major") {
    return { input: chordName, symbol: chord.symbol, tonic: chord.tonic, quality: "major" };
  }

  if (chord.quality === "Minor") {
    return { input: chordName, symbol: chord.symbol, tonic: chord.tonic, quality: "minor" };
  }

  return null;
}

function buildSuggestion(
  category: ChordSuggestionCategory,
  chord: string,
  relationship: string,
  description: string,
): ChordSuggestion {
  return {
    id: `${category}:${chord}:${relationship}`.toLowerCase(),
    category,
    chord,
    displayName: formatChordName(chord),
    relationship,
    description,
  };
}

function addSuggestion(suggestions: ChordSuggestion[], suggestion: ChordSuggestion, originalSymbol: string) {
  if (suggestion.chord === originalSymbol || suggestions.some((existing) => existing.chord === suggestion.chord)) {
    return;
  }

  suggestions.push(suggestion);
}

function majorSuggestions(parsed: ParsedSuggestedChord): ChordSuggestion[] {
  const { tonic, symbol } = parsed;
  const relativeMinor = Key.majorKey(tonic).minorRelative;
  const fifth = Note.transpose(tonic, "5P");
  const third = Note.transpose(tonic, "3M");
  const suggestions: ChordSuggestion[] = [];

  if (relativeMinor) {
    addSuggestion(
      suggestions,
      buildSuggestion("variate", `${relativeMinor}m`, "relative minor", "Keeps the same key center while shifting the mood darker."),
      symbol,
    );
  }

  addSuggestion(suggestions, buildSuggestion("variate", `${tonic}sus2`, "suspended color", "Replaces the third with the second for an open, unresolved color."), symbol);
  addSuggestion(suggestions, buildSuggestion("variate", `${tonic}sus4`, "suspended color", "Replaces the third with the fourth for a lift before resolving."), symbol);
  addSuggestion(suggestions, buildSuggestion("variate", `${tonic}m`, "parallel minor", "Borrows the tonic minor sound for a modal color shift."), symbol);

  addSuggestion(suggestions, buildSuggestion("spice-up", `${tonic}maj7`, "major seventh", "Adds a smooth leading-tone color without changing the chord function."), symbol);
  addSuggestion(suggestions, buildSuggestion("spice-up", `${tonic}add9`, "added ninth", "Adds shimmer while keeping the basic major triad intact."), symbol);
  addSuggestion(suggestions, buildSuggestion("spice-up", `${tonic}6`, "sixth color", "Adds a warmer old-school color that still feels settled."), symbol);

  addSuggestion(suggestions, buildSuggestion("spice-down", `${tonic}5`, "power chord", "Removes the third so the harmony is leaner and more riff-friendly."), symbol);

  addSuggestion(suggestions, buildSuggestion("phrasing", `${tonic}/${third}`, "first inversion", "Put the third in the bass for a smoother stepwise bass line."), symbol);
  addSuggestion(suggestions, buildSuggestion("phrasing", `${tonic}/${fifth}`, "second inversion", "Put the fifth in the bass for a more suspended phrase ending."), symbol);

  return suggestions;
}

function minorSuggestions(parsed: ParsedSuggestedChord): ChordSuggestion[] {
  const { tonic, symbol } = parsed;
  const relativeMajor = Key.minorKey(tonic).relativeMajor;
  const fifth = Note.transpose(tonic, "5P");
  const third = Note.transpose(tonic, "3m");
  const suggestions: ChordSuggestion[] = [];

  if (relativeMajor) {
    addSuggestion(
      suggestions,
      buildSuggestion("variate", relativeMajor, "relative major", "Keeps the same key center while brightening the mood."),
      symbol,
    );
  }

  addSuggestion(suggestions, buildSuggestion("variate", `${tonic}sus4`, "minor suspension", "Hides the minor third briefly for a more open guitar shape."), symbol);
  addSuggestion(suggestions, buildSuggestion("variate", `${tonic}M`, "parallel major", "Borrows the tonic major sound for a brighter modal turn."), symbol);

  addSuggestion(suggestions, buildSuggestion("spice-up", `${tonic}m7`, "minor seventh", "Adds a familiar blues and rock color while preserving the minor feel."), symbol);
  addSuggestion(suggestions, buildSuggestion("spice-up", `${tonic}m9`, "minor ninth", "Adds a darker, more spacious extension for sustained chords."), symbol);
  addSuggestion(suggestions, buildSuggestion("spice-up", `${tonic}m11`, "minor eleventh", "Adds a wide modal color that works well as a held texture."), symbol);

  addSuggestion(suggestions, buildSuggestion("spice-down", `${tonic}5`, "power chord", "Removes the third so the chord becomes more direct and riff-friendly."), symbol);

  addSuggestion(suggestions, buildSuggestion("phrasing", `${tonic}/${third}`, "first inversion", "Put the minor third in the bass for a smoother melodic bass move."), symbol);
  addSuggestion(suggestions, buildSuggestion("phrasing", `${tonic}/${fifth}`, "second inversion", "Put the fifth in the bass to make the phrase feel less final."), symbol);

  return suggestions;
}

function dominantSuggestions(parsed: ParsedSuggestedChord): ChordSuggestion[] {
  const { tonic, symbol } = parsed;
  const tritone = Note.transpose(tonic, "4A");
  const third = Note.transpose(tonic, "3M");
  const suggestions: ChordSuggestion[] = [];

  addSuggestion(suggestions, buildSuggestion("variate", `${tritone}7`, "tritone substitution", "Keeps the dominant pull but moves the bass by a tritone."), symbol);
  addSuggestion(suggestions, buildSuggestion("variate", `${tonic}7sus4`, "dominant suspension", "Delays the third for a more phrase-like resolution."), symbol);

  addSuggestion(suggestions, buildSuggestion("spice-up", `${tonic}9`, "dominant ninth", "Adds a bluesy extension while keeping the dominant function clear."), symbol);
  addSuggestion(suggestions, buildSuggestion("spice-up", `${tonic}13`, "dominant thirteenth", "Adds a richer funk or jazz color for a stronger setup."), symbol);

  addSuggestion(suggestions, buildSuggestion("spice-down", `${tonic}M`, "major triad", "Removes the seventh for a simpler, more stable sound."), symbol);
  addSuggestion(suggestions, buildSuggestion("spice-down", `${tonic}5`, "power chord", "Reduces the chord to root and fifth for a lean guitar hit."), symbol);

  addSuggestion(suggestions, buildSuggestion("phrasing", `${tonic}/${third}`, "first inversion", "Put the third in the bass to lead smoothly into the next root."), symbol);

  return suggestions;
}

function applyFilters(suggestions: ChordSuggestion[], options: ChordSuggestionOptions): ChordSuggestion[] {
  const categorySet = options.categories ? new Set(options.categories) : null;
  const filtered = categorySet ? suggestions.filter((suggestion) => categorySet.has(suggestion.category)) : suggestions;

  const limitPerCategory = options.limitPerCategory;
  if (!limitPerCategory) {
    return filtered.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));
  }

  const counts = new Map<ChordSuggestionCategory, number>();
  return filtered
    .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
    .filter((suggestion) => {
      const count = counts.get(suggestion.category) ?? 0;
      if (count >= limitPerCategory) {
        return false;
      }
      counts.set(suggestion.category, count + 1);
      return true;
    });
}

export function getChordSuggestions(
  chordName: string | null,
  options: ChordSuggestionOptions = {},
): ChordSuggestionResult {
  const parsed = parseChord(chordName);
  if (!parsed) {
    return {
      input: chordName,
      parsed: null,
      suggestions: [],
      unsupportedReason: chordName?.trim() ? "Unsupported chord label" : "Missing chord label",
    };
  }

  const suggestionsByQuality: Record<ParsedChordQuality, (parsedChord: ParsedSuggestedChord) => ChordSuggestion[]> = {
    major: majorSuggestions,
    minor: minorSuggestions,
    dominant: dominantSuggestions,
  };

  return {
    input: chordName,
    parsed,
    suggestions: applyFilters(suggestionsByQuality[parsed.quality](parsed), options),
  };
}
