import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChordDisplay } from "./ChordDisplay";

describe("ChordDisplay", () => {
  it("renders a selectable chord button", () => {
    const onChordSelect = vi.fn();

    render(<ChordDisplay chordName="C Major" onChordSelect={onChordSelect} />);

    const button = screen.getByRole("button", { name: /select chord c major/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    expect(onChordSelect).toHaveBeenCalledTimes(1);
    expect(onChordSelect).toHaveBeenCalledWith("C Major");
  });

  it("renders nothing when there is no chord", () => {
    const { container } = render(<ChordDisplay chordName={null} onChordSelect={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
