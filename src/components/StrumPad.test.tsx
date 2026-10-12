import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StrumPad } from "./StrumPad";

const { player } = vi.hoisted(() => {
  let engine = "synth";
  const listeners = new Set<() => void>();
  return {
    player: {
      strum: vi.fn(),
      pluck: vi.fn(),
      setEngine: vi.fn((next: string) => {
        engine = next;
        listeners.forEach((listener) => listener());
      }),
      getEngine: () => engine,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      dispose: vi.fn(),
      reset: () => {
        engine = "synth";
      },
    },
  };
});

vi.mock("../lib/strumPlayer", () => ({
  getStrumPlayer: () => player,
}));

describe("StrumPad", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    player.reset();
  });

  it("strums the shape down and up", () => {
    render(<StrumPad frets={[-1, 3, 2, 0, 1, 0]} chordName="C" />);

    fireEvent.click(screen.getByRole("button", { name: "Strum C down" }));
    fireEvent.click(screen.getByRole("button", { name: "Strum C up" }));

    expect(player.strum).toHaveBeenNthCalledWith(1, [-1, 3, 2, 0, 1, 0], "down");
    expect(player.strum).toHaveBeenNthCalledWith(2, [-1, 3, 2, 0, 1, 0], "up");
  });

  it("labels each string with its sounding note and disables muted strings", () => {
    render(<StrumPad frets={[-1, -1, 0, 2, 3, 2]} chordName="D" />);

    expect(screen.getByRole("button", { name: "Low E string muted" })).toBeDisabled();
    const fSharp = screen.getByRole("button", { name: "Pluck High E string (F#4)" });
    expect(fSharp).toHaveTextContent("F#");

    fireEvent.click(fSharp);
    expect(player.pluck).toHaveBeenCalledWith([-1, -1, 0, 2, 3, 2], 5);
  });

  it("switches between the synth and the sampled sound", () => {
    render(<StrumPad frets={[0, 2, 2, 0, 0, 0]} chordName="Em" />);

    expect(screen.getByRole("radio", { name: "Synth" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Sampled" }));

    expect(player.setEngine).toHaveBeenCalledWith("sample");
    expect(screen.getByRole("radio", { name: "Sampled" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps every mounted pad's switch in step with the shared player", () => {
    render(
      <>
        <StrumPad frets={[0, 2, 2, 0, 0, 0]} chordName="Em" />
        <StrumPad frets={[-1, 0, 2, 2, 1, 0]} chordName="Am" />
      </>,
    );

    fireEvent.click(screen.getAllByRole("radio", { name: "Sampled" })[0]);

    screen.getAllByRole("radio", { name: "Sampled" }).forEach((radio) => {
      expect(radio).toHaveAttribute("aria-checked", "true");
    });
  });
});
