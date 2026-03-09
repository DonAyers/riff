import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Recorder } from "./Recorder";

describe("Recorder", () => {
  it("calls onStart when idle record button is pressed", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();

    render(<Recorder state="idle" onStart={onStart} onStop={onStop} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });

  it("calls onStop when recording button is pressed", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();

    render(<Recorder state="recording" onStart={onStart} onStop={onStop} error={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });
});
