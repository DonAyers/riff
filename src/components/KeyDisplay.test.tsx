import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeyDisplay } from "./KeyDisplay";

describe("KeyDisplay", () => {
  it("renders the primary and relative keys", () => {
    render(
      <KeyDisplay
        result={{
          primary: {
            key: "G",
            mode: "major",
            label: "G Major",
            confidence: 0.82,
            correlation: 0.64,
          },
          alternatives: [],
          ranked: [],
          lowConfidence: false,
        }}
      />
    );

    expect(screen.getByText(/g major/i)).toBeInTheDocument();
    expect(screen.getByText(/relative: e minor/i)).toBeInTheDocument();
    expect(screen.getByText(/confidence 82%/i)).toBeInTheDocument();
  });

  it("shows a warning when the result is low confidence", () => {
    render(
      <KeyDisplay
        result={{
          primary: {
            key: "C",
            mode: "major",
            label: "C Major",
            confidence: 0.54,
            correlation: 0.08,
          },
          alternatives: [],
          ranked: [],
          lowConfidence: true,
        }}
      />
    );

    expect(screen.getByText(/record a longer clip/i)).toBeInTheDocument();
  });

  it("renders nothing when there is no key result", () => {
    const { container } = render(<KeyDisplay result={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});