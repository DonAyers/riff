import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChordTimeline } from "./ChordTimeline";

describe("ChordTimeline", () => {
  it("renders clickable chord events for each event", () => {
    const onChordSelect = vi.fn();

    render(
      <ChordTimeline
        onChordSelect={onChordSelect}
        events={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.8 },
          { chord: "FM", label: "F Major", startTimeS: 1, endTimeS: 1.6 },
        ]}
      />
    );

    const firstEvent = screen.getByRole("button", { name: /select chord c major at 0.00s/i });
    const secondEvent = screen.getByRole("button", { name: /select chord f major at 1.00s/i });

    expect(firstEvent).toBeInTheDocument();
    expect(secondEvent).toBeInTheDocument();

    fireEvent.click(firstEvent);

    expect(onChordSelect).toHaveBeenCalledTimes(1);
    expect(onChordSelect).toHaveBeenCalledWith(
      "C Major",
      expect.objectContaining({
        chord: "CM",
        label: "C Major",
        startTimeS: 0,
        endTimeS: 0.8,
      }),
    );
  });

  it("renders nothing when there are no chord events", () => {
    const { container } = render(<ChordTimeline events={[]} onChordSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
