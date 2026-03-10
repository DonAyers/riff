import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportPanel } from "./ExportPanel";
import type { MappedNote } from "../lib/noteMapper";
import * as audioExport from "../lib/audioExport";

vi.mock("../lib/audioExport", () => ({
  encodeWav: vi.fn(() => new Blob(["wav"], { type: "audio/wav" })),
  exportToMidi: vi.fn(() => new Blob(["midi"], { type: "audio/midi" })),
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
  compressedBlob: null as Blob | null,
  compressedMime: null as string | null,
  riffName: "Test Riff",
  visible: true,
};

describe("ExportPanel", () => {
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
  });

  it("has an accessible group role", () => {
    render(<ExportPanel {...defaultProps} />);
    expect(screen.getByRole("group", { name: /export options/i })).toBeInTheDocument();
  });

  it("disables MIDI button when notes array is empty", () => {
    render(<ExportPanel {...defaultProps} notes={[]} />);
    expect(screen.getByRole("button", { name: /export as midi/i })).toBeDisabled();
  });

  it("disables WAV button when pcmAudio is null", () => {
    render(<ExportPanel {...defaultProps} pcmAudio={null} />);
    expect(screen.getByRole("button", { name: /export as wav/i })).toBeDisabled();
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

  it("calls encodeWav and downloadBlob when WAV button is clicked", () => {
    render(<ExportPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /export as wav/i }));

    expect(audioExport.encodeWav).toHaveBeenCalledWith(defaultProps.pcmAudio);
    expect(audioExport.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      "Test-Riff.wav",
    );
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
