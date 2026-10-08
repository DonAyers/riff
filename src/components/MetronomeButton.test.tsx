import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetronomeButton } from "./MetronomeButton";

describe("MetronomeButton", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pulses on each beat it hears while ticking and clears when it stops", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    let beat = 0;
    const props = {
      clickOn: true,
      isSetUp: true,
      onToggle: vi.fn(),
      onOpenSettings: vi.fn(),
      getBeatPosition: () => ({ beat, beatsPerBar: 4 }),
    };
    const { rerender } = render(<MetronomeButton {...props} isTicking />);
    const button = screen.getByRole("button", { name: "Metronome" });

    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(button).toHaveAttribute("data-beat", "down");

    beat = 2;
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(button).toHaveAttribute("data-beat", "beat");

    rerender(<MetronomeButton {...props} isTicking={false} />);
    expect(button).not.toHaveAttribute("data-beat");
  });
});
