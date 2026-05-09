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
    render(<GuitarTuner />);

    expect(screen.getByRole("region", { name: /guitar tuner/i })).toBeInTheDocument();
    expect(screen.getByText("Tune before you record")).toBeInTheDocument();
    expect(screen.getByText("Ready to listen")).toBeInTheDocument();
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

    render(<GuitarTuner />);

    expect(screen.getByText("A2")).toBeInTheDocument();
    expect(screen.getByText("110.1 Hz")).toBeInTheDocument();
    expect(screen.getByText("+2 cents")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /tuning cents/i })).toHaveAttribute("aria-valuetext", "+2 cents sharp");
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
