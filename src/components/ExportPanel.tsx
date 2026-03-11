import { useCallback, useState } from "react";
import type { MappedNote } from "../lib/noteMapper";
import { encodeWav, exportToMidi, exportToMp3, downloadBlob } from "../lib/audioExport";
import "./ExportPanel.css";

interface ExportPanelProps {
  notes: MappedNote[];
  /** Raw PCM audio at 22 kHz mono, if available */
  pcmAudio: Float32Array | null;
  /** Pre-encoded compressed blob (WebM/MP4), if available */
  compressedBlob: Blob | null;
  /** MIME of the compressed blob, for file extension */
  compressedMime: string | null;
  /** Riff name for filenames */
  riffName: string;
  visible: boolean;
}

function mimeToExportExtension(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  return "audio";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-") || "riff";
}

export function ExportPanel({
  notes,
  pcmAudio,
  compressedBlob,
  compressedMime,
  riffName,
  visible,
}: ExportPanelProps) {
  const baseName = sanitizeFilename(riffName);

  const handleExportMidi = useCallback(() => {
    if (notes.length === 0) return;
    const blob = exportToMidi(notes);
    downloadBlob(blob, `${baseName}.mid`);
  }, [notes, baseName]);

  const handleExportWav = useCallback(() => {
    if (!pcmAudio) return;
    const blob = encodeWav(pcmAudio);
    downloadBlob(blob, `${baseName}.wav`);
  }, [pcmAudio, baseName]);

  const handleExportNative = useCallback(() => {
    if (!compressedBlob || !compressedMime) return;
    const ext = mimeToExportExtension(compressedMime);
    downloadBlob(compressedBlob, `${baseName}.${ext}`);
  }, [compressedBlob, compressedMime, baseName]);

  const [isExportingMp3, setIsExportingMp3] = useState(false);

  const handleExportMp3 = useCallback(async () => {
    if (!pcmAudio) return;
    try {
      setIsExportingMp3(true);
      const blob = await exportToMp3(pcmAudio);
      downloadBlob(blob, `${baseName}.mp3`);
    } catch (err) {
      console.error("Failed to export MP3:", err);
    } finally {
      setIsExportingMp3(false);
    }
  }, [pcmAudio, baseName]);

  if (!visible) return null;

  const hasMidi = notes.length > 0;
  const hasWav = pcmAudio !== null;
  const hasNative = compressedBlob !== null && compressedMime !== null;

  return (
    <div className="export-panel" role="group" aria-label="Export options">
      <span className="export-label">Export</span>
      <div className="export-buttons">
        <button
          className="export-btn"
          onClick={handleExportMidi}
          disabled={!hasMidi}
          aria-label="Export as MIDI"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
          </svg>
          MIDI
        </button>

        <button
          className="export-btn"
          onClick={handleExportWav}
          disabled={!hasWav}
          aria-label="Export as WAV"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v6h5.66V9h3.84L12 2z" />
          </svg>
          WAV
        </button>

        <button
          className="export-btn"
          onClick={handleExportMp3}
          disabled={!hasWav || isExportingMp3}
          aria-label="Export as MP3"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v6h5.66V9h3.84L12 2z" />
          </svg>
          {isExportingMp3 ? "..." : "MP3"}
        </button>

        {hasNative && (
          <button
            className="export-btn"
            onClick={handleExportNative}
            aria-label="Export original audio"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v6h5.66V9h3.84L12 2z" />
            </svg>
            {mimeToExportExtension(compressedMime!).toUpperCase()}
          </button>
        )}
      </div>
    </div>
  );
}
