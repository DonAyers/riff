import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Looper } from "./Looper";
import { useLooper, type LooperTrackState, type UseLooperReturn } from "../hooks/useLooper";

vi.mock("../hooks/useLooper", () => ({ useLooper: vi.fn() }));

const useLooperMock = vi.mocked(useLooper);

function track(status: LooperTrackState["status"], patch: Partial<LooperTrackState> = {}): LooperTrackState {
  return { status, muted: false, volume: 0.9, peaks: status === "playing" ? [0.2, 0.8] : [], ...patch };
}

function hookReturn(overrides: Partial<UseLooperReturn> = {}): UseLooperReturn {
  return {
    tracks: [track("empty"), track("empty"), track("empty"), track("empty")],
    loopDurationS: null,
    isPlaying: false,
    isStarting: false,
    error: null,
    latencyNudgeMs: 0,
    setLatencyNudgeMs: vi.fn(),
    toggleRecord: vi.fn().mockResolvedValue(undefined),
    toggleMute: vi.fn(),
    setVolume: vi.fn(),
    clearTrack: vi.fn(),
    clearAll: vi.fn(),
    togglePlayback: vi.fn(),
    getLoopPosition: vi.fn(() => null),
    ...overrides,
  };
}

describe("Looper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLooperMock.mockReturnValue(hookReturn());
  });

  it("starts empty with four record buttons and no transport", () => {
    render(<Looper />);

    expect(screen.getByTestId("loop-length")).toHaveTextContent("No loop yet");
    expect(screen.getByRole("button", { name: "Play loop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /^Record track/ })).toHaveLength(4);
    expect(screen.getByText(/tap record on any track/i)).toBeInTheDocument();
  });

  it("records a track when its button is pressed", () => {
    const toggleRecord = vi.fn().mockResolvedValue(undefined);
    useLooperMock.mockReturnValue(hookReturn({ toggleRecord }));
    render(<Looper />);

    fireEvent.click(screen.getByRole("button", { name: "Record track 3" }));

    expect(toggleRecord).toHaveBeenCalledWith(2);
  });

  it("locks other tracks while the first loop is being recorded", () => {
    useLooperMock.mockReturnValue(
      hookReturn({ tracks: [track("recording"), track("empty"), track("empty"), track("empty")] })
    );
    render(<Looper />);

    expect(screen.getByRole("button", { name: "Close loop on track 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Record track 2" })).toBeDisabled();
    expect(screen.getByText(/tap again to close the loop/i)).toBeInTheDocument();
  });

  it("shows loop length, track states and per-track controls once a loop exists", () => {
    const hook = hookReturn({
      loopDurationS: 4.25,
      isPlaying: true,
      tracks: [track("playing"), track("armed"), track("recording"), track("empty", { muted: true })],
    });
    useLooperMock.mockReturnValue(hook);
    render(<Looper />);

    expect(screen.getByTestId("loop-length")).toHaveTextContent("Loop 0:04.3");
    expect(screen.getByTestId("track-1-status")).toHaveTextContent("Looping");
    expect(screen.getByTestId("track-2-status")).toHaveTextContent("Starts at the top of the loop");
    expect(screen.getByRole("button", { name: "Cancel take on track 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-record track 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mute track 4" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Clear track 4" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Stop loop" }));
    fireEvent.click(screen.getByRole("button", { name: "Mute track 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear track 1" }));
    fireEvent.change(screen.getByRole("slider", { name: "Track 1 volume" }), { target: { value: "0.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(hook.togglePlayback).toHaveBeenCalled();
    expect(hook.toggleMute).toHaveBeenCalledWith(0);
    expect(hook.clearTrack).toHaveBeenCalledWith(0);
    expect(hook.setVolume).toHaveBeenCalledWith(0, 0.5);
    expect(hook.clearAll).toHaveBeenCalled();
  });

  it("adjusts the recording offset and shows errors", () => {
    const setLatencyNudgeMs = vi.fn();
    useLooperMock.mockReturnValue(hookReturn({ setLatencyNudgeMs, error: "Microphone unavailable." }));
    render(<Looper />);

    fireEvent.click(screen.getByText("Timing"));
    fireEvent.change(screen.getByRole("slider", { name: /recording offset/i }), { target: { value: "120" } });

    expect(setLatencyNudgeMs).toHaveBeenCalledWith(120);
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone unavailable.");
  });
});
