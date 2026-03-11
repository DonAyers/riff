import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChordTimeline } from "./ChordTimeline";

describe("ChordTimeline", () => {
  it("renders chord labels for each event", () => {
    render(
      <ChordTimeline
        events={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.8 },
          { chord: "FM", label: "F Major", startTimeS: 1, endTimeS: 1.6 },
        ]}
      />
    );

    expect(screen.getByText(/c major/i)).toBeInTheDocument();
    expect(screen.getByText(/f major/i)).toBeInTheDocument();
  });

  it("renders nothing when there are no chord events", () => {
    const { container } = render(<ChordTimeline events={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});