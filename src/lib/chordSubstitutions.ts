import { Chord, Key, Note } from "tonal";

export interface ChordSubstitution {
  name: string;
  type: "relative" | "sus" | "seventh" | "tritone" | "borrowed" | "extension";
  description: string;
}

export function getVariateSuggestions(chordName: string | null): ChordSubstitution[] {
  if (!chordName) return [];

  // Tonal struggles with 'M' vs 'maj' sometimes, standardize a bits
  const normalizedMatch = chordName.match(/^([A-G](?:#|b)?)[\s-]+(.+)$/);
  let searchName = chordName;
  if (normalizedMatch) {
     const [, tonic, quality] = normalizedMatch;
     if (quality.toLowerCase() === "major") searchName = `${tonic}M`;
     else if (quality.toLowerCase() === "minor") searchName = `${tonic}m`;
  }

  const chord = Chord.get(searchName);
  if (chord.empty || !chord.tonic) return [];

  const suggestions: ChordSubstitution[] = [];
  const add = (name: string, type: ChordSubstitution["type"], description: string) => {
      // deduplicate
      if (!suggestions.find(s => s.name === name) && name !== chord.symbol && name !== chordName) {
          suggestions.push({ name, type, description });
      }
  };

  const tonic = chord.tonic;
  const isDominant = chord.aliases.includes("7") || chordName.endsWith("7");

  if (isDominant) {
      // Tritone substitution (dominant 7th -> dominant 7th a tritone away)
      const tritoneKey = Note.transpose(tonic, "4A"); // Augmented 4th / tritone
      add(`${tritoneKey}7`, "tritone", "Tritone substitution");

      // Extended
      add(`${tonic}9`, "extension", "Dominant 9th");
      
      // Sus
      add(`${tonic}7sus4`, "sus", "Suspended 4th");
  } else if (chord.quality === "Major") {
      // Relative minor (vi)
      const minorRelative = Key.majorKey(tonic).minorRelative;
      if (minorRelative) {
        add(`${minorRelative}m`, "relative", "Relative minor");
      }
      
      // Sus variants
      add(`${tonic}sus2`, "sus", "Suspended 2nd");
      add(`${tonic}sus4`, "sus", "Suspended 4th");

      // Extensions
      add(`${tonic}maj7`, "seventh", "Major 7th");

      // Borrowed from minor
      add(`${tonic}m`, "borrowed", "Parallel minor");
  } 
  else if (chord.quality === "Minor") {
      // Relative major (III)
      const majorRelative = Key.minorKey(tonic).relativeMajor;
      if (majorRelative) {
        add(majorRelative, "relative", "Relative major");
      }

      // Extensions
      add(`${tonic}m7`, "seventh", "Minor 7th");
      
      // Borrowed
      add(`${tonic}M`, "borrowed", "Parallel major");
  }

  return suggestions.slice(0, 4); // Limit to top 4 options
}