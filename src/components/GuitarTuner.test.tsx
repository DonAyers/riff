import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuitarTuner, formatCents } from "./GuitarTuner";
import { useGuitarTuner, type UseGuitarTunerReturn } from "../hooks/useGuitarTuner";
import { STANDARD_GUITAR_STRINGS, TUNING_PRESETS, type TuningReading } from "../lib/guitarTuner";

vi.mock("../hooks/useGuitarTuner", () => ({
  useGuitarTuner: vi.fn(),
}));

const useGuitarTunerMock = vi.mocked(useGuitarTuner);

function hookReturn(overrides: Partial<UseGuitarTunerReturn> = {}): UseGuitarTunerReturn {
  return {
    state: "idle",
    reading: null,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    tuning: TUNING_PRESETS[0],
    setTuningId: vi.fn(),
    strings: STANDARD_GUITAR_STRINGS,
    a4Hz: 440,
    setA4Hz: vi.fn(),
    lockedStringId: null,
    setLockedStringId: vi.fn(),
    ...overrides,
  };
}

function reading(cents: number, overrides: Partial<TuningReading> = {}): TuningReading {
  const target = STANDARD_GUITAR_STRINGS[1];
  return {
    frequencyHz: target.frequencyHz * 2 ** (cents / 1200),
    detectedNote: "A2",
    target,
    cents,
    inTune: Math.abs(cents) <= 3,
    clarity: 0.98,
    held: false,
    ...overrides,
  };
}

describe("GuitarTuner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGuitarTunerMock.mockReturnValue(hookReturn());
  });

  it("renders an idle tuner with a start control", () => {
    render(<GuitarTuner />);

    expect(screen.getByRole("region", { name: /guitar tuner/i })).toBeInTheDocument();
    expect(screen.getByTestId("tuner-hint")).toHaveTextContent("Tap start, then pluck one string");
    expect(screen.getByRole("meter", { name: /tuning cents/i })).toHaveAttribute(
      "aria-valuetext",
      "No stable pitch"
    );
    expect(screen.getByRole("combobox", { name: /tuning/i })).toHaveValue("standard");
    expect(screen.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /string \(/i })).toHaveLength(6);
    expect(screen.getByRole("button", { name: /start tuner/i })).toBeInTheDocument();
  });

  it("starts the tuner when requested", () => {
    const start = vi.fn();
    useGuitarTunerMock.mockReturnValue(hookReturn({ start }));

    render(<GuitarTuner />);
    fireEvent.click(screen.getByRole("button", { name: /start tuner/i }));

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("shows a big note with a tune-up hint when flat", () => {
    useGuitarTunerMock.mockReturnValue(hookReturn({ state: "listening", reading: reading(-22) }));
    const { container } = render(<GuitarTuner />);

    expect(screen.getByTestId("tuner-note")).toHaveTextContent("A2");
    expect(screen.getByTestId("tuner-hint")).toHaveTextContent("Tune up");
    expect(screen.getByText("−22¢")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /tuning cents/i })).toHaveAttribute(
      "aria-valuetext",
      "−22¢ flat"
    );
    expect(container.querySelector(".guitar-tuner--far")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^A string/ })).toHaveClass("guitar-tuner__string--active");
  });

  it("shows tune down when sharp and in tune near zero", () => {
    useGuitarTunerMock.mockReturnValue(hookReturn({ state: "listening", reading: reading(9) }));
    const { container, rerender } = render(<GuitarTuner />);

    expect(screen.getByTestId("tuner-hint")).toHaveTextContent("Tune down");
    expect(container.querySelector(".guitar-tuner--close")).toBeInTheDocument();

    useGuitarTunerMock.mockReturnValue(hookReturn({ state: "listening", reading: reading(1.4) }));
    rerender(<GuitarTuner />);

    expect(screen.getByTestId("tuner-hint")).toHaveTextContent("In tune");
    expect(screen.getByText("+1¢")).toBeInTheDocument();
    expect(container.querySelector(".guitar-tuner--in-tune")).toBeInTheDocument();
  });

  it("dims a held reading and asks for another pluck", () => {
    useGuitarTunerMock.mockReturnValue(
      hookReturn({ state: "listening", reading: reading(-12, { held: true }) })
    );
    const { container } = render(<GuitarTuner />);

    expect(screen.getByTestId("tuner-hint")).toHaveTextContent("Pluck again");
    expect(container.querySelector(".guitar-tuner--held")).toBeInTheDocument();
  });

  it("locks and unlocks a string", () => {
    const setLockedStringId = vi.fn();
    useGuitarTunerMock.mockReturnValue(hookReturn({ setLockedStringId }));
    const { rerender } = render(<GuitarTuner />);

    fireEvent.click(screen.getByRole("button", { name: /^Low E string/ }));
    expect(setLockedStringId).toHaveBeenCalledWith("e2");

    useGuitarTunerMock.mockReturnValue(hookReturn({ setLockedStringId, lockedStringId: "e2" }));
    rerender(<GuitarTuner />);

    const locked = screen.getByRole("button", { name: /^Low E string \(E2\), locked/ });
    expect(locked).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("tuner-note")).toHaveTextContent("E2");

    fireEvent.click(locked);
    expect(setLockedStringId).toHaveBeenLastCalledWith(null);
  });

  it("changes tuning and reference pitch", () => {
    const setTuningId = vi.fn();
    const setA4Hz = vi.fn();
    useGuitarTunerMock.mockReturnValue(hookReturn({ setTuningId, setA4Hz }));
    render(<GuitarTuner />);

    fireEvent.change(screen.getByRole("combobox", { name: /tuning/i }), {
      target: { value: "drop-d" },
    });
    fireEvent.click(screen.getByRole("button", { name: /raise reference pitch/i }));
    fireEvent.click(screen.getByRole("button", { name: /lower reference pitch/i }));

    expect(setTuningId).toHaveBeenCalledWith("drop-d");
    expect(setA4Hz).toHaveBeenNthCalledWith(1, 441);
    expect(setA4Hz).toHaveBeenNthCalledWith(2, 439);
  });

  it("stops the tuner when requested", () => {
    const stop = vi.fn();
    useGuitarTunerMock.mockReturnValue(hookReturn({ state: "listening", stop }));

    render(<GuitarTuner />);
    fireEvent.click(screen.getByRole("button", { name: /stop tuner/i }));

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("disables and stops listening while capture is busy", () => {
    const stop = vi.fn();
    useGuitarTunerMock.mockReturnValue(hookReturn({ state: "listening", stop }));

    render(<GuitarTuner disabled={true} />);

    expect(screen.getByRole("button", { name: /stop tuner/i })).toBeDisabled();
    expect(stop).toHaveBeenCalled();
  });

  it("formats cents with a real minus sign", () => {
    expect(formatCents(0.2)).toBe("0¢");
    expect(formatCents(-4.6)).toBe("−5¢");
    expect(formatCents(12)).toBe("+12¢");
  });
});
