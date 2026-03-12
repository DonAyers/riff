import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectedChordDialog } from "./SelectedChordDialog";

vi.mock("./ChordFretboard", () => ({
  ChordFretboard: ({ chordName }: { chordName?: string | null }) => (
    <div data-testid="chord-fretboard">Fretboard for {chordName}</div>
  ),
}));

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
});
