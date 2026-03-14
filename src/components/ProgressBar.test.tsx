import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders an accessible progress status with descriptive copy", () => {
    render(
      <ProgressBar
        progress={42}
        visible
        eyebrow="Analysis in progress"
        label="Listening for notes"
        description="Notes and timing will show up here together."
        variant="panel"
        ariaLabel="Review progress"
      />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Analysis in progress");
    expect(screen.getByText("Listening for notes")).toBeInTheDocument();
    expect(
      screen.getByText("Notes and timing will show up here together.")
    ).toBeInTheDocument();

    const progressbar = screen.getByRole("progressbar", {
      name: /review progress/i,
    });
    expect(progressbar).toHaveAttribute("aria-valuenow", "42");
  });

  it("returns nothing when it is hidden", () => {
    const { container } = render(<ProgressBar progress={10} visible={false} />);

    expect(container).toBeEmptyDOMElement();
  });
});
