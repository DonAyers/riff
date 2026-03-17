import { useCallback, useId, useState } from "react";
import type { MappedNote } from "../lib/noteMapper";
import {
  DEFAULT_WAV_EXPORT_OPTIONS,
  downloadBlob,
  exportToMidi,
  exportToMp3,
  exportToWav,
  type WavBitDepth,
  type WavSampleRate,
} from "../lib/audioExport";
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
  const wavSettingsId = useId();
  const [wavSettingsOpen, setWavSettingsOpen] = useState(false);
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [wavBitDepth, setWavBitDepth] = useState<WavBitDepth>(DEFAULT_WAV_EXPORT_OPTIONS.bitDepth);
  const [wavSampleRate, setWavSampleRate] = useState<WavSampleRate>(DEFAULT_WAV_EXPORT_OPTIONS.sampleRate);
  const [normalizeWavPeak, setNormalizeWavPeak] = useState<boolean>(
    DEFAULT_WAV_EXPORT_OPTIONS.normalizePeak
  );

  const handleExportMidi = useCallback(() => {
    if (notes.length === 0) return;
    const blob = exportToMidi(notes);
    downloadBlob(blob, `${baseName}.mid`);
  }, [notes, baseName]);

  const handleExportWav = useCallback(async () => {
    if (!pcmAudio) return;
    try {
      setIsExportingWav(true);
      const blob = await exportToWav(pcmAudio, {
        bitDepth: wavBitDepth,
        normalizePeak: normalizeWavPeak,
        sampleRate: wavSampleRate,
      });
      downloadBlob(blob, `${baseName}.wav`);
    } catch (err) {
      console.error("Failed to export WAV:", err);
    } finally {
      setIsExportingWav(false);
    }
  }, [baseName, normalizeWavPeak, pcmAudio, wavBitDepth, wavSampleRate]);

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
  const hasCustomWavOptions = wavBitDepth !== DEFAULT_WAV_EXPORT_OPTIONS.bitDepth
    || wavSampleRate !== DEFAULT_WAV_EXPORT_OPTIONS.sampleRate
    || normalizeWavPeak !== DEFAULT_WAV_EXPORT_OPTIONS.normalizePeak;

  return (
    <div className="export-panel" role="group" aria-label="Export options">
      <span className="export-label">Export</span>
      <div className="export-buttons">
        <button
          type="button"
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
          type="button"
          className="export-btn"
          onClick={handleExportWav}
          disabled={!hasWav || isExportingWav}
          aria-label={isExportingWav ? "Preparing WAV export, please wait" : "Export as WAV"}
          aria-busy={isExportingWav}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v6h5.66V9h3.84L12 2z" />
          </svg>
          {isExportingWav ? "Preparing…" : "WAV"}
        </button>

        <button
          type="button"
          className={`export-btn export-btn--subtle ${hasCustomWavOptions ? "export-btn--active" : ""}`}
          onClick={() => setWavSettingsOpen((current) => !current)}
          disabled={!hasWav}
          aria-expanded={wavSettingsOpen}
          aria-controls={wavSettingsId}
          aria-label={wavSettingsOpen ? "Hide WAV quality options" : "Show WAV quality options"}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5zM4 13V11L6.02 10.3C6.17 9.81 6.36 9.34 6.61 8.9L5.67 7L7.08 5.59L8.98 6.53C9.42 6.28 9.89 6.09 10.38 5.94L11 3.92H13L13.62 5.94C14.11 6.09 14.58 6.28 15.02 6.53L16.92 5.59L18.33 7L17.39 8.9C17.64 9.34 17.83 9.81 17.98 10.3L20 11V13L17.98 13.7C17.83 14.19 17.64 14.66 17.39 15.1L18.33 17L16.92 18.41L15.02 17.47C14.58 17.72 14.11 17.91 13.62 18.06L13 20.08H11L10.38 18.06C9.89 17.91 9.42 17.72 8.98 17.47L7.08 18.41L5.67 17L6.61 15.1C6.36 14.66 6.17 14.19 6.02 13.7L4 13z" />
          </svg>
          WAV quality
        </button>

        <button
          type="button"
          className="export-btn"
          onClick={handleExportMp3}
          disabled={!hasWav || isExportingMp3}
          aria-label={isExportingMp3 ? "Encoding MP3, please wait" : "Export as MP3"}
          aria-busy={isExportingMp3}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M5 20h14v-2H5v2zm7-18L5.33 9h3.84v6h5.66V9h3.84L12 2z" />
          </svg>
          {isExportingMp3 ? "Encoding…" : "MP3"}
        </button>

        {hasNative && (
          <button
            type="button"
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

      {wavSettingsOpen && hasWav && (
        <div className="export-quality-panel" id={wavSettingsId} role="group" aria-label="WAV quality settings">
          <div className="export-quality-copy">
            <p className="export-quality-title">WAV quality</p>
            <p className="export-quality-description">
              Defaults stay the same: 16-bit, 22.05 kHz, no normalization.
            </p>
          </div>
          <div className="export-quality-toggles">
            <label className="export-quality-toggle">
              <input
                type="checkbox"
                checked={wavBitDepth === 24}
                onChange={(e) => setWavBitDepth(e.target.checked ? 24 : 16)}
              />
              <span>24-bit depth</span>
            </label>
            <label className="export-quality-toggle">
              <input
                type="checkbox"
                checked={normalizeWavPeak}
                onChange={(e) => setNormalizeWavPeak(e.target.checked)}
              />
              <span>Normalize peak</span>
            </label>
            <label className="export-quality-toggle">
              <input
                type="checkbox"
                checked={wavSampleRate === 44100}
                onChange={(e) => setWavSampleRate(e.target.checked ? 44100 : 22050)}
              />
              <span>44.1 kHz compatibility</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
