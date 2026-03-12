import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  profileId: "guitar" as const,
  onProfileChange: vi.fn(),
};

describe("Recorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("keeps the primary profile picker guitar-first", () => {
    render(<Recorder {...defaultProps} />);

    expect(
      screen.getByRole("radiogroup", { name: /instrument profile/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Default" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Guitar" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Piano" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Guitar" })).toHaveAttribute("aria-checked", "true");
  });

  it("updates capture settings and the selected profile when the user changes them", () => {
    const onAutoProcessChange = vi.fn();
    const onStorageFormatChange = vi.fn();
    const onProfileChange = vi.fn();

    render(
      <Recorder
        {...defaultProps}
        onAutoProcessChange={onAutoProcessChange}
        onStorageFormatChange={onStorageFormatChange}
        onProfileChange={onProfileChange}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /auto-detect/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /compress/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Piano" }));

    expect(onAutoProcessChange).toHaveBeenCalledWith(true);
    expect(onStorageFormatChange).toHaveBeenCalledWith("compressed");
    expect(onProfileChange).toHaveBeenCalledWith("piano");
  });

  it("disables guitar-first controls while analysis is busy", () => {
    render(<Recorder {...defaultProps} isLoading={true} hasPendingAnalysis={true} />);

    expect(screen.getByRole("checkbox", { name: /auto-detect/i })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /compress/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Guitar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /detect notes/i })).toBeDisabled();
  });

  it("enables manual note detection when a take is ready and auto-detect is off", () => {
    const onAnalyze = vi.fn();

    render(
      <Recorder
        {...defaultProps}
        onAnalyze={onAnalyze}
        hasPendingAnalysis={true}
      />
    );

    const detectButton = screen.getByRole("button", { name: /detect notes/i });
    expect(detectButton).toBeEnabled();

    fireEvent.click(detectButton);

    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });
});
