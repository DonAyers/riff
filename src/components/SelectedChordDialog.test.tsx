import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectedChordDialog } from "./SelectedChordDialog";

vi.mock("./ChordFretboard", () => ({
  ChordFretboard: ({ chordName, voicing }: { chordName?: string | null; voicing?: { frets: number[] } }) => (
    <div data-testid="chord-fretboard" data-frets={voicing?.frets.join(",")}>Fretboard for {chordName}</div>
  ),
}));

const playedCOverG = {
  chord: "CM/G",
  label: "C Major/G",
  startTimeS: 0,
  endTimeS: 1,
  notes: ["G2", "C3", "E3", "G3", "C4", "E4"],
  bassNote: "G2",
  voicing: { frets: [3, 3, 2, 0, 1, 0] as [number, number, number, number, number, number], fingers: [3, 4, 2, 0, 1, 0] as [number, number, number, number, number, number], barres: [], baseFret: 1 },
};

describe("SelectedChordDialog", () => {
  it("renders the selected chord details and advances voicings", () => {
    const onClose = vi.fn();
    const onVoicingChange = vi.fn();

    render(
      <SelectedChordDialog
        chord="C Major"
        context={{ chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.8 }}
        voicingIndex={0}
        onVoicingChange={onVoicingChange}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("dialog", { name: /selected guitar chord/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "C Major" })).toBeInTheDocument();
    expect(screen.getByText(/timeline chord/i)).toBeInTheDocument();
    expect(screen.getByText(/guitar voicing 1 of \d+/i)).toBeInTheDocument();
    expect(screen.getByTestId("chord-fretboard")).toHaveTextContent(/fretboard for c major/i);

    fireEvent.click(screen.getByRole("button", { name: /next phrase/i }));

    expect(onVoicingChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: /close selected chord/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on escape", () => {
    const onClose = vi.fn();

    render(
      <SelectedChordDialog
        chord="C Major"
        voicingIndex={0}
        onVoicingChange={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the shape the chord was played with first, with its inversion and notes", () => {
    render(
      <SelectedChordDialog
        chord="C Major/G"
        context={playedCOverG}
        voicingIndex={0}
        onVoicingChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/played shape · 1 of \d+/i)).toBeInTheDocument();
    expect(screen.getByTestId("voicing-summary")).toHaveTextContent("2nd inversion · G2 C3 E3 G3 C4 E4");
    expect(screen.getByTestId("chord-fretboard")).toHaveAttribute("data-frets", "3,3,2,0,1,0");
  });
});
