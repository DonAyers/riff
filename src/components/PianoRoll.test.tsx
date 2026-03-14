import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PianoRoll } from "./PianoRoll";
import type { MappedNote } from "../lib/noteMapper";

const SAMPLE_NOTES: MappedNote[] = [
  {
    midi: 60,
    name: "C4",
    pitchClass: "C",
    octave: 4,
    startTimeS: 0,
    durationS: 0.5,
    amplitude: 0.4,
  },
  {
    midi: 64,
    name: "E4",
    pitchClass: "E",
    octave: 4,
    startTimeS: 0.75,
    durationS: 0.25,
    amplitude: 0.35,
  },
];

describe("PianoRoll", () => {
  it("renders nothing when there are no notes", () => {
    const { container } = render(<PianoRoll notes={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a timeline playback button that starts preview playback", () => {
    const onPlay = vi.fn();

    render(<PianoRoll notes={SAMPLE_NOTES} onPlay={onPlay} onStop={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /play midi preview/i }));

    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(screen.getByText("0:00 / 0:01")).toBeInTheDocument();
  });

  it("renders a stop state and positions the playhead while playback is active", () => {
    const onStop = vi.fn();

    const { container } = render(
      <PianoRoll
        notes={SAMPLE_NOTES}
        isPlaying
        currentTimeS={0.5}
        durationS={1}
        onPlay={vi.fn()}
        onStop={onStop}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /stop midi preview/i }));

    expect(onStop).toHaveBeenCalledTimes(1);
    const playhead = container.querySelector(".piano-roll-playhead");
    expect(playhead).not.toBeNull();
    expect(playhead).toHaveAttribute("style", expect.stringContaining("left: 50%"));
  });
});
