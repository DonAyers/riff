import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Recorder } from "./Recorder";

const defaultProps = {
  state: "idle" as const,
  onStart: vi.fn(),
  onStop: vi.fn(),
  onImport: vi.fn(),
  isImporting: false,
  error: null,
  autoProcess: false,
  onAutoProcessChange: vi.fn(),
  storageFormat: "pcm" as const,
  onStorageFormatChange: vi.fn(),
  recorderState: "idle" as const,
  isLoading: false,
  hasPendingAnalysis: false,
  onAnalyze: vi.fn(),
  profileId: "default" as const,
  onProfileChange: vi.fn(),
};

describe("Recorder", () => {
  it("calls onStart when idle record button is pressed", () => {
    const onStart = vi.fn();

    render(<Recorder {...defaultProps} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("calls onStop when recording button is pressed", () => {
    const onStop = vi.fn();

    render(<Recorder {...defaultProps} state="recording" onStop={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("renders the import file button", () => {
    render(<Recorder {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Import audio file" })).toBeTruthy();
  });

  it("disables import button while recording", () => {
    render(<Recorder {...defaultProps} state="recording" />);
    expect(screen.getByRole("button", { name: "Import audio file" })).toBeDisabled();
  });

  it("disables import button while importing", () => {
    render(<Recorder {...defaultProps} isImporting={true} />);
    expect(screen.getByRole("button", { name: "Import audio file" })).toBeDisabled();
  });

  it("calls onImport when a file is selected", () => {
    const onImport = vi.fn();
    render(<Recorder {...defaultProps} onImport={onImport} />);

    const file = new File(["audio"], "test.mp3", { type: "audio/mpeg" });
    const input = document.querySelector<HTMLInputElement>(".import-file-input")!;
    fireEvent.change(input, { target: { files: [file] } });

    expect(onImport).toHaveBeenCalledWith(file);
  });

  it("shows 'Preparing audio…' when isImporting is true", () => {
    render(<Recorder {...defaultProps} isImporting={true} />);
    expect(screen.getByText("Preparing…")).toBeTruthy();
  });
});
