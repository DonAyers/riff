import type { GuitarVoicing } from "../lib/chordVoicings";
import "./ChordFretboard.css";

interface ChordFretboardProps {
  voicing: GuitarVoicing;
  chordName?: string | null;
}

const STRING_COUNT = 6;
const FRET_COUNT = 5;
const SVG_WIDTH = 260;
const SVG_HEIGHT = 300;
const TOP_PADDING = 42;
const BOTTOM_PADDING = 26;
const LEFT_PADDING = 28;
const RIGHT_PADDING = 28;

export function ChordFretboard({ voicing, chordName }: ChordFretboardProps) {
  const stringSpacing = (SVG_WIDTH - LEFT_PADDING - RIGHT_PADDING) / (STRING_COUNT - 1);
  const fretSpacing = (SVG_HEIGHT - TOP_PADDING - BOTTOM_PADDING) / FRET_COUNT;
  const baseFret = voicing.baseFret;

  const dots = voicing.frets.flatMap((fret, stringIndex) => {
    if (fret <= 0) return [];

    const relativeFret = fret - baseFret;
    if (relativeFret < 0 || relativeFret >= FRET_COUNT) return [];

    return [{
      stringIndex,
      fret,
      finger: voicing.fingers[stringIndex],
      cx: LEFT_PADDING + stringIndex * stringSpacing,
      cy: TOP_PADDING + (relativeFret + 0.5) * fretSpacing,
    }];
  });

  const barreOverlays = voicing.barres.flatMap((barreFret) => {
    const relativeFret = barreFret - baseFret;
    if (relativeFret < 0 || relativeFret >= FRET_COUNT) return [];

    const stringsWithBarre = voicing.frets
      .map((fret, index) => (fret === barreFret ? index : -1))
      .filter((index) => index >= 0);

    if (stringsWithBarre.length < 2) return [];

    const firstString = Math.min(...stringsWithBarre);
    const lastString = Math.max(...stringsWithBarre);

    return [{
      fret: barreFret,
      x: LEFT_PADDING + firstString * stringSpacing - 10,
      y: TOP_PADDING + (relativeFret + 0.5) * fretSpacing - 10,
      width: (lastString - firstString) * stringSpacing + 20,
    }];
  });

  return (
    <div className="chord-fretboard">
      <div className="chord-fretboard__header">
        <span className="chord-fretboard__label">Fretboard</span>
        {baseFret > 1 && <span className="chord-fretboard__meta">Base fret {baseFret}</span>}
      </div>
      <svg
        className="chord-fretboard__svg"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label={chordName ? `Fretboard for ${chordName}` : "Chord fretboard"}
      >
        {voicing.frets.map((fret, stringIndex) => {
          const x = LEFT_PADDING + stringIndex * stringSpacing;
          const marker = fret < 0 ? "X" : fret === 0 ? "O" : null;

          return (
            <g key={`string-${stringIndex}`}>
              <line x1={x} y1={TOP_PADDING} x2={x} y2={SVG_HEIGHT - BOTTOM_PADDING} className="chord-fretboard__string" />
              {marker && (
                <text x={x} y={24} textAnchor="middle" className="chord-fretboard__marker">
                  {marker}
                </text>
              )}
            </g>
          );
        })}

        {Array.from({ length: FRET_COUNT + 1 }, (_, index) => {
          const y = TOP_PADDING + index * fretSpacing;
          const isNut = baseFret === 1 && index === 0;

          return (
            <line
              key={`fret-${index}`}
              x1={LEFT_PADDING}
              y1={y}
              x2={SVG_WIDTH - RIGHT_PADDING}
              y2={y}
              className={isNut ? "chord-fretboard__nut" : "chord-fretboard__fret"}
            />
          );
        })}

        {barreOverlays.map((barre) => (
          <rect
            key={`barre-${barre.fret}`}
            x={barre.x}
            y={barre.y}
            width={barre.width}
            height={20}
            rx={10}
            className="chord-fretboard__barre"
          />
        ))}

        {dots.map((dot) => (
          <g key={`dot-${dot.stringIndex}-${dot.fret}`}>
            <circle cx={dot.cx} cy={dot.cy} r={13} className="chord-fretboard__dot" />
            {dot.finger > 0 && (
              <text x={dot.cx} y={dot.cy + 4} textAnchor="middle" className="chord-fretboard__finger">
                {dot.finger}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}