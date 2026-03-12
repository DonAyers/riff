import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChordFretboard } from "./ChordFretboard";

interface MockDiagramSettings {
  position?: number;
  noPosition?: boolean;
  svgTitle?: string;
}

interface MockDiagramChord {
  fingers: Array<[number, number | "x", string?]>;
  barres: Array<{
    fret: number;
    fromString: number;
    toString: number;
    text?: string;
  }>;
  position?: number;
}

interface MockSVGuitarChordInstance {
  container: HTMLElement;
  settings?: MockDiagramSettings;
  chordData?: MockDiagramChord;
}

const mockChartInstances: MockSVGuitarChordInstance[] = [];

vi.mock("svguitar", () => ({
  OPEN: 0,
  SILENT: "x",
  SVGuitarChord: class MockSVGuitarChord {
    container: HTMLElement;
    settings?: MockDiagramSettings;
    chordData?: MockDiagramChord;

    constructor(container: HTMLElement) {
      this.container = container;
      mockChartInstances.push(this);
    }

    configure(settings: MockDiagramSettings) {
      this.settings = settings;
      return this;
    }

    chord(chordData: MockDiagramChord) {
      this.chordData = chordData;
      return this;
    }

    draw() {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = this.settings?.svgTitle ?? "";
      svg.append(title);
      this.container.replaceChildren(svg);
      return { width: 260, height: 300 };
    }
  },
}));

describe("ChordFretboard", () => {
  beforeEach(() => {
    mockChartInstances.length = 0;
  });

  it("adapts open and muted strings into the svguitar diagram model", () => {
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

    const diagram = screen.getByRole("img", { name: /fretboard for c major/i });
    expect(diagram).toBeInTheDocument();
    expect(diagram.querySelector("svg")).toBeInTheDocument();

    expect(mockChartInstances).toHaveLength(1);
    expect(mockChartInstances[0].settings).toEqual(
      expect.objectContaining({
        position: 1,
        noPosition: false,
        svgTitle: "Fretboard for C Major",
      })
    );
    expect(mockChartInstances[0].chordData).toEqual(
      expect.objectContaining({
        position: 1,
        barres: [],
        fingers: [
          [6, "x"],
          [5, 3, "3"],
          [4, 2, "2"],
          [3, 0],
          [2, 1, "1"],
          [1, 0],
        ],
      })
    );
  });

  it("maps upper-position barres into svguitar barres and hides duplicate finger dots", () => {
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
    expect(mockChartInstances).toHaveLength(1);
    expect(mockChartInstances[0].settings).toEqual(
      expect.objectContaining({
        position: 8,
        noPosition: true,
        svgTitle: "Fretboard for C Major",
      })
    );
    expect(mockChartInstances[0].chordData?.barres).toEqual([
      expect.objectContaining({
        fret: 1,
        fromString: 6,
        toString: 1,
        text: "1",
      }),
    ]);
    expect(mockChartInstances[0].chordData?.fingers).toEqual([
      [5, 3, "3"],
      [4, 3, "4"],
      [3, 2, "2"],
    ]);
  });

  it("replaces the rendered diagram when the voicing changes", () => {
    const { rerender } = render(
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

    const diagram = screen.getByRole("img", { name: /fretboard for c major/i });
    expect(diagram.querySelectorAll("svg")).toHaveLength(1);

    rerender(
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

    expect(diagram.querySelectorAll("svg")).toHaveLength(1);
    expect(mockChartInstances).toHaveLength(2);
  });
});
