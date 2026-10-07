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
    loopTrim: null,
    canUndo: false,
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
    setLoopTrim: vi.fn(),
    resetLoopTrim: vi.fn(),
    undoLastTake: vi.fn(),
    metronome: { clickOn: false, bpm: 100, beatsPerBar: 4 },
    grid: null,
    setClickOn: vi.fn(),
    setBpm: vi.fn(),
    setBeatsPerBar: vi.fn(),
    tapTempo: vi.fn(),
    fitTempoToLoop: vi.fn(),
    scaleTempo: vi.fn(),
    getBeatPosition: vi.fn(() => null),
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

  it("hides the loop edges until there is a first take to trim", () => {
    render(<Looper />);

    expect(screen.queryByRole("group", { name: "Loop edges" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last take" })).toBeDisabled();
  });

  it("moves the loop edges with the nudge buttons and sliders", () => {
    const hook = hookReturn({
      loopDurationS: 2.03,
      isPlaying: true,
      loopTrim: { startMs: -20, endMs: 50 },
      tracks: [track("playing"), track("empty"), track("empty"), track("empty")],
    });
    useLooperMock.mockReturnValue(hook);
    render(<Looper />);

    const edges = screen.getByRole("group", { name: "Loop edges" });
    expect(screen.getByTestId("loop-start-offset")).toHaveTextContent("−20 ms");
    expect(screen.getByTestId("loop-end-offset")).toHaveTextContent("+50 ms");
    expect(screen.getByText(/move the loop edges/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Move loop start 10 ms earlier" }));
    expect(hook.setLoopTrim).toHaveBeenLastCalledWith({ startMs: -30 });
    fireEvent.click(screen.getByRole("button", { name: "Move loop end 10 ms later" }));
    expect(hook.setLoopTrim).toHaveBeenLastCalledWith({ endMs: 60 });
    fireEvent.change(screen.getByRole("slider", { name: "Loop end offset in milliseconds" }), {
      target: { value: "-400" },
    });
    expect(hook.setLoopTrim).toHaveBeenLastCalledWith({ endMs: -400 });

    fireEvent.click(screen.getByRole("button", { name: "Reset loop edges" }));
    expect(hook.resetLoopTrim).toHaveBeenCalled();
    expect(edges).toBeInTheDocument();
  });

  it("undoes the last take unless a take is in progress", () => {
    const hook = hookReturn({
      loopDurationS: 2,
      isPlaying: true,
      canUndo: true,
      tracks: [track("playing"), track("playing"), track("empty"), track("empty")],
    });
    useLooperMock.mockReturnValue(hook);
    const { rerender } = render(<Looper />);

    fireEvent.click(screen.getByRole("button", { name: "Undo last take" }));
    expect(hook.undoLastTake).toHaveBeenCalled();

    useLooperMock.mockReturnValue({ ...hook, tracks: [track("playing"), track("playing"), track("armed"), track("empty")] });
    rerender(<Looper />);
    expect(screen.getByRole("button", { name: "Undo last take" })).toBeDisabled();
  });

  it("sets the click, tempo and meter before the first loop", () => {
    const hook = hookReturn();
    useLooperMock.mockReturnValue(hook);
    render(<Looper />);

    fireEvent.click(screen.getByRole("button", { name: "Click" }));
    expect(hook.setClickOn).toHaveBeenCalledWith(true);

    const bpm = screen.getByRole("spinbutton", { name: "Tempo in beats per minute" });
    fireEvent.change(bpm, { target: { value: "1" } });
    expect(hook.setBpm).not.toHaveBeenCalled();
    fireEvent.change(bpm, { target: { value: "126" } });
    fireEvent.keyDown(bpm, { key: "Enter" });
    expect(hook.setBpm).toHaveBeenCalledWith(126);

    fireEvent.click(screen.getByRole("button", { name: "Tap" }));
    expect(hook.tapTempo).toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "Beats per bar" }), { target: { value: "3" } });
    expect(hook.setBeatsPerBar).toHaveBeenCalledWith(3);
  });

  it("shows a count-in and locks the other tracks while it runs", () => {
    useLooperMock.mockReturnValue(
      hookReturn({
        metronome: { clickOn: true, bpm: 100, beatsPerBar: 4 },
        tracks: [track("armed"), track("empty"), track("empty"), track("empty")],
      })
    );
    render(<Looper />);

    expect(screen.getByTestId("track-1-status")).toHaveTextContent("Count-in");
    expect(screen.getByText(/start playing on the next downbeat/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record track 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Click" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tap" })).toBeDisabled();
  });

  it("offers to fit a tempo to a loop that was played freely", () => {
    const hook = hookReturn({
      loopDurationS: 2,
      isPlaying: true,
      tracks: [track("playing"), track("empty"), track("empty"), track("empty")],
    });
    useLooperMock.mockReturnValue(hook);
    render(<Looper />);

    expect(screen.getByText("Played freely")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fit tempo" }));
    expect(hook.fitTempoToLoop).toHaveBeenCalled();
  });

  it("shows the loop's tempo, scales it and moves the loop end a beat at a time", () => {
    const hook = hookReturn({
      loopDurationS: 4,
      isPlaying: true,
      grid: { beats: 8, bpm: 120 },
      loopTrim: { startMs: 0, endMs: 0 },
      metronome: { clickOn: true, bpm: 120, beatsPerBar: 4 },
      tracks: [track("playing"), track("empty"), track("empty"), track("empty")],
    });
    useLooperMock.mockReturnValue(hook);
    render(<Looper />);

    expect(screen.getByTestId("loop-tempo")).toHaveTextContent("120 BPM · 2 bars");
    fireEvent.click(screen.getByRole("button", { name: "Halve the tempo" }));
    expect(hook.scaleTempo).toHaveBeenCalledWith(0.5);
    fireEvent.click(screen.getByRole("button", { name: "Double the tempo" }));
    expect(hook.scaleTempo).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole("button", { name: "Move loop end one beat later" }));
    expect(hook.setLoopTrim).toHaveBeenLastCalledWith({ endMs: 500 });
    fireEvent.click(screen.getByRole("button", { name: "Move loop start 10 ms earlier" }));
    expect(hook.setLoopTrim).toHaveBeenLastCalledWith({ startMs: -10 });
  });
});
