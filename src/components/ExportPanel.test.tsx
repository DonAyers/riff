import { createRef } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportPanel } from "./ExportPanel";
import type { MappedNote } from "../lib/noteMapper";
import * as audioExport from "../lib/audioExport";

vi.mock("../lib/audioExport", () => ({
  DEFAULT_WAV_EXPORT_OPTIONS: {
    bitDepth: 16,
    inputSampleRate: 22050,
    normalizePeak: false,
    sampleRate: 22050,
  },
  exportToMidi: vi.fn(() => new Blob(["midi"], { type: "audio/midi" })),
  exportToWav: vi.fn(() => Promise.resolve(new Blob(["wav"], { type: "audio/wav" }))),
  exportToMp3: vi.fn(() => Promise.resolve(new Blob(["mp3"], { type: "audio/mp3" }))),
  downloadBlob: vi.fn(),
}));

const SAMPLE_NOTE: MappedNote = {
  midi: 60,
  name: "C4",
  pitchClass: "C",
  octave: 4,
  startTimeS: 0,
  durationS: 0.5,
  amplitude: 0.5,
};

const defaultProps = {
  notes: [SAMPLE_NOTE],
  pcmAudio: new Float32Array(100),
  pcmSampleRate: 22050,
  compressedBlob: null as Blob | null,
  compressedMime: null as string | null,
  riffName: "Test Riff",
  visible: true,
};

describe("ExportPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when visible is false", () => {
    const { container } = render(
      <ExportPanel {...defaultProps} visible={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the export label and buttons when visible", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.getByText("Export")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export as midi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export as wav/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show wav quality options/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export as mp3/i })).toBeInTheDocument();
  });

  it("has an accessible group role", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.getByRole("group", { name: /export options/i })).toBeInTheDocument();
  });

  it("all export buttons have explicit type='button'", () => {
    render(<ExportPanel {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    for (const btn of buttons) {
      expect(btn).toHaveAttribute("type", "button");
    }
  });

  it("exposes the primary export button through the shortcut ref", () => {
    const shortcutTargetRef = createRef<HTMLButtonElement>();

    render(<ExportPanel {...defaultProps} shortcutTargetRef={shortcutTargetRef} />);

    expect(shortcutTargetRef.current).toBe(screen.getByRole("button", { name: /export as midi/i }));
  });

  it("disables MIDI button when notes array is empty", () => {
    render(<ExportPanel {...defaultProps} notes={[]} />);
    expect(screen.getByRole("button", { name: /export as midi/i })).toBeDisabled();
  });

  it("disables WAV button when pcmAudio is null", () => {
    render(<ExportPanel {...defaultProps} pcmAudio={null} />);
    expect(screen.getByRole("button", { name: /export as wav/i })).toBeDisabled();
  });

  it("disables MP3 button when pcmAudio is null", () => {
    render(<ExportPanel {...defaultProps} pcmAudio={null} />);
    expect(screen.getByRole("button", { name: /export as mp3/i })).toBeDisabled();
  });

  it("does not render native export button when compressedBlob is null", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.queryByRole("button", { name: /export original/i })).not.toBeInTheDocument();
  });

  it("renders native export button when compressed blob is provided", () => {
    render(
      <ExportPanel
        {...defaultProps}
        compressedBlob={new Blob(["audio"], { type: "audio/webm" })}
        compressedMime="audio/webm;codecs=opus"
      />,
    );
    expect(screen.getByRole("button", { name: /export original/i })).toBeInTheDocument();
    expect(screen.getByText("WEBM")).toBeInTheDocument();
  });

  it("shows M4A label for mp4 compressed blobs", () => {
    render(
      <ExportPanel
        {...defaultProps}
        compressedBlob={new Blob(["audio"], { type: "audio/mp4" })}
        compressedMime="audio/mp4;codecs=aac"
      />,
    );
    expect(screen.getByText("M4A")).toBeInTheDocument();
  });

  it("calls exportToMidi and downloadBlob when MIDI button is clicked", () => {
    render(<ExportPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /export as midi/i }));

    expect(audioExport.exportToMidi).toHaveBeenCalledWith(defaultProps.notes);
    expect(audioExport.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "Test-Riff.mid",
    );
  });

  it("keeps WAV quality options hidden until requested", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.queryByRole("group", { name: /wav quality settings/i })).not.toBeInTheDocument();
  });

  it("reveals WAV quality options with current-safe defaults", () => {
    render(<ExportPanel {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /show wav quality options/i }));

    expect(screen.getByRole("group", { name: /wav quality settings/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /24-bit depth/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /normalize peak/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /44.1 khz compatibility/i })).not.toBeChecked();
    expect(screen.getByText(/defaults stay the same: 16-bit, 22.05 khz, no normalization/i)).toBeInTheDocument();
  });

  it("calls exportToWav and downloadBlob when WAV button is clicked", async () => {
    render(<ExportPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /export as wav/i }));

    await waitFor(() => {
      expect(audioExport.exportToWav).toHaveBeenCalledWith(defaultProps.pcmAudio, {
        bitDepth: 16,
        inputSampleRate: 22050,
        normalizePeak: false,
        sampleRate: 22050,
      });
    });
    expect(audioExport.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "Test-Riff.wav",
    );
  });

  it("passes enabled WAV quality options to exportToWav", async () => {
    render(<ExportPanel {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /show wav quality options/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /24-bit depth/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /normalize peak/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /44.1 khz compatibility/i }));
    fireEvent.click(screen.getByRole("button", { name: /export as wav/i }));

    await waitFor(() => {
      expect(audioExport.exportToWav).toHaveBeenCalledWith(defaultProps.pcmAudio, {
        bitDepth: 24,
        inputSampleRate: 22050,
        normalizePeak: true,
        sampleRate: 44100,
      });
    });
  });

  it("shows 'Preparing…' label and aria-busy while WAV export is in progress", async () => {
    let resolveWav!: (blob: Blob) => void;
    vi.mocked(audioExport.exportToWav).mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        resolveWav = resolve;
      }),
    );

    render(<ExportPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /export as wav/i }));

    const preparingBtn = await screen.findByRole("button", { name: /preparing wav export/i });
    expect(preparingBtn).toHaveAttribute("aria-busy", "true");
    expect(preparingBtn).toBeDisabled();
    expect(preparingBtn).toHaveTextContent("Preparing…");

    resolveWav(new Blob(["wav"], { type: "audio/wav" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /export as wav/i })).toBeInTheDocument();
    });
  });

  it("calls exportToMp3 and downloadBlob when MP3 button is clicked", async () => {
    render(<ExportPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /export as mp3/i }));

    await waitFor(() => {
      expect(audioExport.exportToMp3).toHaveBeenCalledWith(defaultProps.pcmAudio, 22050);
    });
    expect(audioExport.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "Test-Riff.mp3",
    );
  });

  it("passes the source sample rate to MP3 export", async () => {
    render(<ExportPanel {...defaultProps} pcmSampleRate={44100} />);
    fireEvent.click(screen.getByRole("button", { name: /export as mp3/i }));

    await waitFor(() => {
      expect(audioExport.exportToMp3).toHaveBeenCalledWith(defaultProps.pcmAudio, 44100);
    });
  });

  it("shows 'Encoding…' label and aria-busy while MP3 export is in progress", async () => {
    // Hold the MP3 export promise so we can inspect mid-flight state
    let resolveMp3!: (b: Blob) => void;
    vi.mocked(audioExport.exportToMp3).mockReturnValueOnce(
      new Promise<Blob>((res) => {
        resolveMp3 = res;
      }),
    );

    render(<ExportPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /export as mp3/i }));

    // Mid-flight: button label and aria-busy should reflect encoding state
    const encodingBtn = await screen.findByRole("button", { name: /encoding mp3/i });
    expect(encodingBtn).toBeInTheDocument();
    expect(encodingBtn).toHaveAttribute("aria-busy", "true");
    expect(encodingBtn).toBeDisabled();
    expect(encodingBtn).toHaveTextContent("Encoding…");

    // Resolve and confirm it resets
    resolveMp3(new Blob(["mp3"], { type: "audio/mp3" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /export as mp3/i })).toBeInTheDocument();
    });
  });

  it("calls downloadBlob with compressed blob when native button is clicked", () => {
    const compressedBlob = new Blob(["audio"], { type: "audio/webm" });
    render(
      <ExportPanel
        {...defaultProps}
        compressedBlob={compressedBlob}
        compressedMime="audio/webm;codecs=opus"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /export original/i }));

    expect(audioExport.downloadBlob).toHaveBeenCalledWith(
      compressedBlob,
      "Test-Riff.webm",
    );
  });

  it("sanitizes special characters from the riff name for filenames", () => {
    render(<ExportPanel {...defaultProps} riffName="My Riff!@#$%^&*()" />);
    fireEvent.click(screen.getByRole("button", { name: /export as midi/i }));

    expect(audioExport.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "My-Riff.mid",
    );
  });
});
