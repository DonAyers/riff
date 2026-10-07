import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBeatLight } from "./useBeatLight";

describe("useBeatLight", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports each new beat once while ticking", () => {
    let beat = 0;
    const onBeat = vi.fn();
    renderHook(() => useBeatLight(() => ({ beat, beatsPerBar: 4 }), true, onBeat));

    act(() => vi.advanceTimersByTime(50));
    expect(onBeat.mock.calls).toEqual([[0]]);

    beat = 1;
    act(() => vi.advanceTimersByTime(50));
    expect(onBeat.mock.calls).toEqual([[0], [1]]);
  });

  it("does not run the frame loop when not ticking", () => {
    const getBeatPosition = vi.fn(() => ({ beat: 0, beatsPerBar: 4 }));
    const onBeat = vi.fn();
    renderHook(() => useBeatLight(getBeatPosition, false, onBeat));

    act(() => vi.advanceTimersByTime(100));
    expect(getBeatPosition).not.toHaveBeenCalled();
    expect(onBeat).not.toHaveBeenCalled();
  });

  it("stops the frame loop and clears the light when ticking stops", () => {
    const getBeatPosition = vi.fn(() => ({ beat: 2, beatsPerBar: 4 }));
    const onBeat = vi.fn();
    const { rerender } = renderHook(({ ticking }) => useBeatLight(getBeatPosition, ticking, onBeat), {
      initialProps: { ticking: true },
    });
    act(() => vi.advanceTimersByTime(50));

    rerender({ ticking: false });
    expect(onBeat).toHaveBeenLastCalledWith(-1);
    const calls = getBeatPosition.mock.calls.length;
    act(() => vi.advanceTimersByTime(100));
    expect(getBeatPosition).toHaveBeenCalledTimes(calls);
  });

  it("stops the frame loop and clears the light on unmount", () => {
    const getBeatPosition = vi.fn(() => ({ beat: 1, beatsPerBar: 4 }));
    const onBeat = vi.fn();
    const { unmount } = renderHook(() => useBeatLight(getBeatPosition, true, onBeat));
    act(() => vi.advanceTimersByTime(50));

    unmount();
    expect(onBeat).toHaveBeenLastCalledWith(-1);
    const calls = getBeatPosition.mock.calls.length;
    act(() => vi.advanceTimersByTime(100));
    expect(getBeatPosition).toHaveBeenCalledTimes(calls);
  });
});
