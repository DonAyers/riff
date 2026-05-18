import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuitarTuner } from "./GuitarTuner";
import { useGuitarTuner } from "../hooks/useGuitarTuner";

vi.mock("../hooks/useGuitarTuner", () => ({
  useGuitarTuner: vi.fn(),
}));

const useGuitarTunerMock = vi.mocked(useGuitarTuner);

const defaultHookReturn = {
  state: "idle" as const,
  reading: null,
  error: null,
  start: vi.fn(),
  stop: vi.fn(),
};

describe("GuitarTuner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGuitarTunerMock.mockReturnValue(defaultHookReturn);
  });

  it("renders an idle tuner with a start control", () => {
    const { container } = render(<GuitarTuner />);

    expect(screen.getByRole("region", { name: /guitar tuner/i })).toBeInTheDocument();
    expect(screen.getByText("Tune before you record")).toBeInTheDocument();
    expect(screen.getByText("Ready to listen")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /guitar string dots waiting for a detected string/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /tuning cents/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /feedback style/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bars/i })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll(".guitar-tuner__bar--active")).toHaveLength(0);
    expect(container.querySelector(".guitar-tuner__in-tune-burst")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start tuner/i })).toBeInTheDocument();
  });

  it("starts the tuner when requested", () => {
    const start = vi.fn();
    useGuitarTunerMock.mockReturnValue({ ...defaultHookReturn, start });

    render(<GuitarTuner />);
    fireEvent.click(screen.getByRole("button", { name: /start tuner/i }));

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("shows a live tuning reading", () => {
    useGuitarTunerMock.mockReturnValue({
      ...defaultHookReturn,
      state: "listening",
      reading: {
        frequencyHz: 110.1,
        detectedNote: "A2",
        target: { id: "a2", label: "A", note: "A2", frequencyHz: 110 },
        cents: 1.57,
        inTune: true,
        clarity: 0.98,
      },
    });

    const { container } = render(<GuitarTuner />);

    expect(container.querySelector(".guitar-tuner__note")).toHaveTextContent("A2");
    expect(screen.getByText("110.1 Hz")).toBeInTheDocument();
    expect(screen.getByText("+2 cents")).toBeInTheDocument();
    expect(screen.getByText("A string")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /a string active in guitar string dots/i })).toBeInTheDocument();
    expect(container.querySelector(".guitar-tuner__string-dot-row--active .guitar-tuner__string-label"))
      .toHaveTextContent("A");
    expect(screen.getByRole("meter", { name: /tuning cents/i })).toHaveAttribute("aria-valuetext", "+2 cents sharp");
    expect(container.querySelectorAll(".guitar-tuner__bar")).toHaveLength(25);
    expect(container.querySelectorAll(".guitar-tuner__bar--active").length).toBeGreaterThan(0);
    expect(container.querySelector(".guitar-tuner__bar-meter--in-tune")).toBeInTheDocument();
    expect(container.querySelector(".guitar-tuner__in-tune-slot .guitar-tuner__in-tune-burst"))
      .toHaveTextContent("👍");
  });

  it("switches between meter feedback styles", () => {
    const { container } = render(<GuitarTuner />);

    expect(container.querySelectorAll(".guitar-tuner__bar")).toHaveLength(25);

    fireEvent.click(screen.getByRole("button", { name: /fine/i }));
    expect(screen.getByRole("button", { name: /fine/i })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll(".guitar-tuner__bar")).toHaveLength(49);

    fireEvent.click(screen.getByRole("button", { name: /fluid/i }));
    expect(screen.getByRole("button", { name: /fluid/i })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll(".guitar-tuner__bar")).toHaveLength(0);
    expect(container.querySelector(".guitar-tuner__fluid-track")).toBeInTheDocument();
  });

  it("stops the tuner when requested", () => {
    const stop = vi.fn();
    useGuitarTunerMock.mockReturnValue({ ...defaultHookReturn, state: "listening", stop });

    render(<GuitarTuner />);
    fireEvent.click(screen.getByRole("button", { name: /stop tuner/i }));

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("disables and stops listening while capture is busy", () => {
    const stop = vi.fn();
    useGuitarTunerMock.mockReturnValue({ ...defaultHookReturn, state: "listening", stop });

    render(<GuitarTuner disabled={true} />);

    expect(screen.getByRole("button", { name: /stop tuner/i })).toBeDisabled();
    expect(stop).toHaveBeenCalled();
  });
});
