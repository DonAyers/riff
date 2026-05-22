import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChordFocusView, type ChordFocusNote } from "./ChordFocusView";

describe("ChordFocusView", () => {
  it("renders focused chord metadata and categorized suggestion buttons", () => {
    render(
      <ChordFocusView
        chordName="C Major"
        meta={{ eyebrow: "Selected chord", subtitle: "Bar 2", detail: "0.80s" }}
        selectedSuggestionChord="Cmaj7"
      />,
    );

    expect(screen.getByRole("region", { name: /focused chord c major/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "C Major" })).toBeInTheDocument();
    expect(screen.getByText("Selected chord")).toBeInTheDocument();
    expect(screen.getByText("Bar 2")).toBeInTheDocument();
    expect(screen.getByText("0.80s")).toBeInTheDocument();

    expect(screen.getByRole("region", { name: /variate suggestions/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /spice up suggestions/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /spice down suggestions/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /phrasing suggestions/i })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /Am relative minor/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cmaj7 major seventh/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /C\/E first inversion/i })).toBeInTheDocument();
  });

  it("applies a suggestion when its pad is clicked", () => {
    const onApplySuggestion = vi.fn();

    render(<ChordFocusView chordName="C Major" onApplySuggestion={onApplySuggestion} />);

    fireEvent.click(screen.getByRole("button", { name: /Cadd9 added ninth/i }));

    expect(onApplySuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "spice-up",
        chord: "Cadd9",
        relationship: "added ninth",
      }),
    );
  });

  it("renders an unsupported state when no suggestions are available", () => {
    render(<ChordFocusView chordName="Not A Chord" />);

    expect(screen.getByRole("heading", { level: 2, name: "Not A Chord" })).toBeInTheDocument();
    expect(screen.getByText("No suggestion lanes yet.")).toBeInTheDocument();
    expect(screen.getByText("Unsupported chord label")).toBeInTheDocument();
  });

  it("emits note editing callbacks when notes are toggled, added, and removed", () => {
    const notes: ChordFocusNote[] = [
      { id: "c", label: "C", role: "root" },
      { id: "e", label: "E", role: "third" },
    ];
    const onNotesChange = vi.fn();
    const onNoteToggle = vi.fn();

    render(
      <ChordFocusView
        chordName="C Major"
        notes={notes}
        onNotesChange={onNotesChange}
        onNoteToggle={onNoteToggle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /1 C root/i }));

    expect(onNoteToggle).toHaveBeenCalledWith(
      expect.objectContaining({ id: "c", muted: true }),
      expect.arrayContaining([expect.objectContaining({ id: "c", muted: true })]),
    );
    expect(onNotesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "c", muted: true })]),
    );

    fireEvent.change(screen.getByLabelText(/add tone/i), { target: { value: "G" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(onNotesChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ label: "G", role: "color" })]),
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove note E" }));

    expect(onNotesChange).toHaveBeenLastCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ id: "e" })]),
    );
  });

  it("can limit the visible suggestion categories for embedding surfaces", () => {
    render(
      <ChordFocusView
        chordName="G7"
        suggestionCategories={["phrasing"]}
        limitPerCategory={1}
      />,
    );

    expect(screen.queryByRole("region", { name: /variate suggestions/i })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /phrasing suggestions/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /first inversion/i })).toHaveLength(1);
  });
});
