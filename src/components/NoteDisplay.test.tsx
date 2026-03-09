import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteDisplay } from "./NoteDisplay";
import type { MappedNote } from "../lib/noteMapper";

const SAMPLE_NOTES: MappedNote[] = [
  {
    midi: 60,
    name: "C4",
    pitchClass: "C",
    octave: 4,
    startTimeS: 0,
    durationS: 0.5,
    amplitude: 0.2,
  },
  {
    midi: 64,
    name: "E4",
    pitchClass: "E",
    octave: 4,
    startTimeS: 0.5,
    durationS: 0.5,
    amplitude: 0.2,
  },
];

describe("NoteDisplay", () => {
  it("renders nothing when there are no notes", () => {
    const { container } = render(<NoteDisplay notes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("calls onNoteClick with the selected note", () => {
    const onNoteClick = vi.fn();

    render(<NoteDisplay notes={SAMPLE_NOTES} onNoteClick={onNoteClick} />);

    fireEvent.click(screen.getByRole("button", { name: /play note c4/i }));

    expect(onNoteClick).toHaveBeenCalledTimes(1);
    expect(onNoteClick).toHaveBeenCalledWith(SAMPLE_NOTES[0]);
  });
});
