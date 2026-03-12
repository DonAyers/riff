import { useEffect, useRef } from "react";
import { OPEN, SILENT, SVGuitarChord, type Barre, type Chord, type ChordSettings, type Finger } from "svguitar";
import type { GuitarVoicing } from "../lib/chordVoicings";
import "./ChordFretboard.css";

interface ChordFretboardProps {
  voicing: GuitarVoicing;
  chordName?: string | null;
}

const FRET_COUNT = 5;
const STRING_NUMBERS = [6, 5, 4, 3, 2, 1] as const;
const BASE_DIAGRAM_SETTINGS: ChordSettings = {
  frets: FRET_COUNT,
  backgroundColor: "none",
  fixedDiagramPosition: true,
  color: "rgba(255, 255, 255, 0.9)",
  stringColor: "rgba(255, 255, 255, 0.45)",
  fretColor: "rgba(255, 255, 255, 0.45)",
  fingerColor: "rgba(130, 98, 255, 0.92)",
  fingerTextColor: "#f5f7ff",
  fingerSize: 0.72,
  fingerTextSize: 24,
  strokeWidth: 2,
  sidePadding: 0.14,
  barreChordRadius: 0.9,
  fingerStrokeColor: "rgba(255, 255, 255, 0.2)",
  fingerStrokeWidth: 1.2,
};

function toDiagramFret(fret: number, baseFret: number) {
  return fret - baseFret + 1;
}

function buildBarres(voicing: GuitarVoicing): { barres: Barre[]; barredStringIndexes: Set<number> } {
  const barredStringIndexes = new Set<number>();
  const barres = voicing.barres.flatMap((barreFret) => {
    const stringIndexes = voicing.frets
      .map((fret, index) => (fret === barreFret ? index : -1))
      .filter((index) => index >= 0);

    if (stringIndexes.length < 2) {
      return [];
    }

    stringIndexes.forEach((index) => barredStringIndexes.add(index));

    const firstIndex = Math.min(...stringIndexes);
    const lastIndex = Math.max(...stringIndexes);
    const finger = stringIndexes.map((index) => voicing.fingers[index]).find((value) => value > 0);

    return [{
      fret: toDiagramFret(barreFret, voicing.baseFret),
      fromString: STRING_NUMBERS[firstIndex],
      toString: STRING_NUMBERS[lastIndex],
      text: finger ? String(finger) : undefined,
    }];
  });

  return { barres, barredStringIndexes };
}

function buildFingers(voicing: GuitarVoicing, barredStringIndexes: Set<number>): Finger[] {
  const fingers: Finger[] = [];

  STRING_NUMBERS.forEach((stringNumber, index) => {
    const fret = voicing.frets[index];
    const finger = voicing.fingers[index];

    if (fret < 0) {
      fingers.push([stringNumber, SILENT]);
      return;
    }

    if (fret === 0) {
      fingers.push([stringNumber, OPEN]);
      return;
    }

    if (barredStringIndexes.has(index)) {
      return;
    }

    const diagramFret = toDiagramFret(fret, voicing.baseFret);
    if (diagramFret < 1) {
      return;
    }

    if (finger > 0) {
      fingers.push([stringNumber, diagramFret, String(finger)]);
      return;
    }

    fingers.push([stringNumber, diagramFret]);
  });

  return fingers;
}

function buildChordDiagram(voicing: GuitarVoicing): Chord {
  const { barres, barredStringIndexes } = buildBarres(voicing);

  return {
    fingers: buildFingers(voicing, barredStringIndexes),
    barres,
    position: voicing.baseFret,
  };
}

export function ChordFretboard({ voicing, chordName }: ChordFretboardProps) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const baseFret = voicing.baseFret;
  const ariaLabel = chordName ? `Fretboard for ${chordName}` : "Chord fretboard";

  useEffect(() => {
    const container = diagramRef.current;
    if (!container) {
      return;
    }

    container.replaceChildren();

    const chart = new SVGuitarChord(container);

    chart
      .configure({
        ...BASE_DIAGRAM_SETTINGS,
        position: baseFret,
        noPosition: baseFret > 1,
        svgTitle: ariaLabel,
      })
      .chord(buildChordDiagram(voicing))
      .draw();

    return () => {
      container.replaceChildren();
    };
  }, [ariaLabel, baseFret, voicing]);

  return (
    <div className="chord-fretboard">
      <div className="chord-fretboard__header">
        <span className="chord-fretboard__label">Fretboard</span>
        {baseFret > 1 && <span className="chord-fretboard__meta">Base fret {baseFret}</span>}
      </div>
      <div
        ref={diagramRef}
        className="chord-fretboard__diagram"
        role="img"
        aria-label={ariaLabel}
      />
    </div>
  );
}
