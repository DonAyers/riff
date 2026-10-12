import { useSyncExternalStore } from "react";
import { Midi } from "tonal";
import { voicingToMidi } from "../lib/pluckSynth";
import { getStrumPlayer, type StrumEngine } from "../lib/strumPlayer";
import "./StrumPad.css";

interface StrumPadProps {
  frets: readonly number[];
  chordName?: string | null;
}

const STRING_LABELS = ["Low E", "A", "D", "G", "B", "High E"] as const;

export function StrumPad({ frets, chordName }: StrumPadProps) {
  const player = getStrumPlayer();
  // The engine lives on the shared player, so every mounted pad shows the same choice.
  const engine = useSyncExternalStore(player.subscribe, player.getEngine);
  const notes = voicingToMidi(frets);
  const chordLabel = chordName ?? "chord";

  const chooseEngine = (next: StrumEngine) => player.setEngine(next);

  return (
    <div className="strum-pad">
      <div className="strum-pad__strums">
        <button
          type="button"
          className="strum-pad__strum"
          onClick={() => player.strum(frets, "down")}
          aria-label={`Strum ${chordLabel} down`}
        >
          Strum ↓
        </button>
        <button
          type="button"
          className="strum-pad__strum"
          onClick={() => player.strum(frets, "up")}
          aria-label={`Strum ${chordLabel} up`}
        >
          Strum ↑
        </button>
      </div>
      <div className="strum-pad__strings" role="group" aria-label="Pluck a string">
        {notes.map((midi, index) => (
          <button
            key={STRING_LABELS[index]}
            type="button"
            className="strum-pad__string"
            disabled={midi === null}
            onClick={() => player.pluck(frets, index)}
            aria-label={midi === null ? `${STRING_LABELS[index]} string muted` : `Pluck ${STRING_LABELS[index]} string (${Midi.midiToNoteName(midi, { sharps: true })})`}
          >
            {midi === null ? "×" : Midi.midiToNoteName(midi, { pitchClass: true, sharps: true })}
          </button>
        ))}
      </div>
      <div className="strum-pad__engine" role="radiogroup" aria-label="Strum sound">
        {(["synth", "sample"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={engine === option}
            className="strum-pad__engine-option"
            onClick={() => chooseEngine(option)}
          >
            {option === "synth" ? "Synth" : "Sampled"}
          </button>
        ))}
      </div>
    </div>
  );
}
