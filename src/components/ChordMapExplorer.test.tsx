import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChordMapExplorer } from "./ChordMapExplorer";

vi.mock("./ChordFretboard", () => ({
  ChordFretboard: ({ chordName }: { chordName?: string | null }) => (
    <div data-testid="chord-fretboard">Shape for {chordName}</div>
  ),
}));

describe("ChordMapExplorer", () => {
  it("shows collapsed chord changes and updates the inline shape when a chord is selected", () => {
    render(
      <ChordMapExplorer
        fallbackChord={null}
        events={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.8 },
          { chord: "CM", label: "C Major", startTimeS: 1, endTimeS: 1.6 },
          { chord: "Em7", label: "E minor 7", startTimeS: 2, endTimeS: 2.8 },
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "2 changes" })).toBeInTheDocument();
    expect(screen.getAllByTestId("chord-map-card")).toHaveLength(2);
    expect(screen.getByTestId("chord-fretboard")).toHaveTextContent("Shape for CM");

    fireEvent.click(screen.getByRole("button", { name: /explore chord e minor 7/i }));

    expect(screen.getByTestId("chord-fretboard")).toHaveTextContent("Shape for Em7");
  });

  it("applies a suggestion inline without opening a dialog", () => {
    render(
      <ChordMapExplorer
        fallbackChord="CM"
        events={[{ chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 1 }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /am relative minor/i }));

    expect(screen.getByTestId("chord-fretboard")).toHaveTextContent("Shape for Am");
    expect(screen.getByRole("button", { name: /detected/i })).toBeInTheDocument();
  });

  it("can still open the full chord sheet for the selected chord", () => {
    const onOpenChord = vi.fn();

    render(
      <ChordMapExplorer
        fallbackChord={null}
        events={[{ chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 1 }]}
        onOpenChord={onOpenChord}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /open full chord sheet/i }));

    expect(onOpenChord).toHaveBeenCalledWith(
      "C Major",
      expect.objectContaining({ label: "C Major" }),
    );
  });
});
