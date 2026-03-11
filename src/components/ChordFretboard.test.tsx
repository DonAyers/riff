import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChordFretboard } from "./ChordFretboard";

describe("ChordFretboard", () => {
  it("renders open and muted string indicators", () => {
    render(
      <ChordFretboard
        chordName="C Major"
        voicing={{
          frets: [-1, 3, 2, 0, 1, 0],
          fingers: [0, 3, 2, 0, 1, 0],
          barres: [],
          baseFret: 1,
        }}
      />
    );

    expect(screen.getByLabelText(/fretboard for c major/i)).toBeInTheDocument();
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getAllByText("O").length).toBeGreaterThan(0);
  });

  it("shows the base fret label and finger numbers for upper-position voicings", () => {
    render(
      <ChordFretboard
        chordName="C Major"
        voicing={{
          frets: [8, 10, 10, 9, 8, 8],
          fingers: [1, 3, 4, 2, 1, 1],
          barres: [8],
          baseFret: 8,
        }}
      />
    );

    expect(screen.getByText(/base fret 8/i)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});