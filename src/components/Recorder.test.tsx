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

  describe("default copy", () => {
    it("shows plain language when idle", () => {
      render(<Recorder {...defaultProps} />);
      expect(screen.getByText("Record live or import audio")).toBeInTheDocument();
    });

    it("shows plain language when recording", () => {
      render(<Recorder {...defaultProps} state="recording" />);
      expect(screen.getByText("Recording…")).toBeInTheDocument();
    });

    it("shows plain language when processing", () => {
      render(<Recorder {...defaultProps} state="processing" />);
      expect(screen.getByText("Processing audio…")).toBeInTheDocument();
    });

    it("shows plain language when importing", () => {
      render(<Recorder {...defaultProps} isImporting={true} />);
      expect(screen.getByText("Processing audio…")).toBeInTheDocument();
    });
  });

  describe("recording indicator", () => {
    it("shows live recording status when actively recording", () => {
      render(<Recorder {...defaultProps} state="recording" />);
      expect(screen.getByRole("status")).toHaveTextContent("Recording live");
      expect(document.querySelector(".recording-indicator__dot")).toBeInTheDocument();
    });

    it("hides indicator when not recording", () => {
      render(<Recorder {...defaultProps} state="idle" />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("hides indicator when processing", () => {
      render(<Recorder {...defaultProps} state="processing" />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("advanced options", () => {
    it("renders advanced section collapsed by default", () => {
      render(<Recorder {...defaultProps} />);
      expect(screen.getByRole("button", { name: /show advanced options/i })).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText("Advanced")).toBeInTheDocument();
    });

    it("expands advanced section when clicked", () => {
      render(<Recorder {...defaultProps} />);
      const toggle = screen.getByRole("button", { name: /show advanced options/i });

      fireEvent.click(toggle);

      expect(screen.getByRole("button", { name: /hide advanced options/i })).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("checkbox", { name: /use compressed audio/i })).toBeVisible();
    });

    it("collapses advanced section when clicked again", () => {
      render(<Recorder {...defaultProps} />);
      const toggle = screen.getByRole("button", { name: /show advanced options/i });

      fireEvent.click(toggle);
      expect(screen.getByRole("button", { name: /hide advanced options/i })).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(screen.getByRole("button", { name: /hide advanced options/i }));
      expect(screen.getByRole("button", { name: /show advanced options/i })).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("checkbox", { name: /use compressed audio/i })).not.toBeInTheDocument();
    });

    it("hides storage format in advanced section", () => {
      render(<Recorder {...defaultProps} />);

      expect(screen.queryByRole("checkbox", { name: /use compressed audio/i })).not.toBeInTheDocument();

      const toggle = screen.getByRole("button", { name: /show advanced options/i });
      fireEvent.click(toggle);

      expect(screen.getByRole("checkbox", { name: /use compressed audio/i })).toBeVisible();
    });

    it("hides detection profile in advanced section", () => {
      render(<Recorder {...defaultProps} />);

      expect(screen.queryByRole("radiogroup", { name: /instrument mode/i })).not.toBeInTheDocument();

      const toggle = screen.getByRole("button", { name: /show advanced options/i });
      fireEvent.click(toggle);

      expect(screen.getByRole("radiogroup", { name: /instrument mode/i })).toBeVisible();
    });
  });

  describe("renamed controls", () => {
    it("renames auto-detect to analyze automatically", () => {
      render(<Recorder {...defaultProps} />);
      expect(screen.getByRole("checkbox", { name: /analyze automatically/i })).toBeInTheDocument();
    });

    it("renames detect notes to analyze now", () => {
      render(<Recorder {...defaultProps} hasPendingAnalysis={true} />);
      expect(screen.getByRole("button", { name: /analyze now/i })).toBeInTheDocument();
    });

    it("renames compress to use compressed audio in advanced", () => {
      render(<Recorder {...defaultProps} />);
      const toggle = screen.getByRole("button", { name: /show advanced options/i });
      fireEvent.click(toggle);
      expect(screen.getByRole("checkbox", { name: /use compressed audio/i })).toBeInTheDocument();
      expect(screen.getByTitle("Reduce audio file size when saving")).toBeInTheDocument();
    });

    it("renames detection focus to instrument mode in advanced", () => {
      render(<Recorder {...defaultProps} />);
      const toggle = screen.getByRole("button", { name: /show advanced options/i });
      fireEvent.click(toggle);

      expect(screen.getByRole("radiogroup", { name: /instrument mode/i })).toBeInTheDocument();
      expect(screen.getByText("Use Guitar for most guitar recordings. Choose Full range for other instruments.")).toBeInTheDocument();
    });
  });

  it("keeps guitar-focused profile options", () => {
    render(<Recorder {...defaultProps} />);
    const toggle = screen.getByRole("button", { name: /show advanced options/i });
    fireEvent.click(toggle);

    expect(screen.getByRole("radiogroup", { name: /instrument mode/i })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((option) => option.getAttribute("value"))).toEqual(["guitar", "default"]);
    expect(screen.getByRole("radio", { name: "Guitar" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Full range" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Piano" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Guitar" })).toBeChecked();
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

    const toggle = screen.getByRole("button", { name: /show advanced options/i });
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole("checkbox", { name: /analyze automatically/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /use compressed audio/i }));
    fireEvent.click(screen.getByRole("radio", { name: "Full range" }));

    expect(onAutoProcessChange).toHaveBeenCalledWith(true);
    expect(onStorageFormatChange).toHaveBeenCalledWith("compressed");
    expect(onProfileChange).toHaveBeenCalledWith("default");
  });

  it("disables controls while analysis is busy", () => {
    render(<Recorder {...defaultProps} isLoading={true} hasPendingAnalysis={true} />);

    expect(screen.getByRole("checkbox", { name: /analyze automatically/i })).toBeDisabled();

    const toggle = screen.getByRole("button", { name: /show advanced options/i });
    fireEvent.click(toggle);

    expect(screen.getByRole("checkbox", { name: /use compressed audio/i })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Guitar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /analyze now/i })).toBeDisabled();
  });

  it("applies recording treatment to the record button when live", () => {
    render(<Recorder {...defaultProps} state="recording" />);

    expect(screen.getByRole("button", { name: "Stop recording" })).toHaveClass("recording");
  });

  it("enables manual analysis when audio is ready and auto-analyze is off", () => {
    const onAnalyze = vi.fn();

    render(
      <Recorder
        {...defaultProps}
        onAnalyze={onAnalyze}
        hasPendingAnalysis={true}
      />
    );

    const analyzeButton = screen.getByRole("button", { name: /analyze now/i });
    expect(analyzeButton).toBeEnabled();

    fireEvent.click(analyzeButton);

    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });
});
