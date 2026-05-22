import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SongBuilder } from "./SongBuilder";
import type { RecorderProps } from "./Recorder";
import { useMidiPlayback } from "../hooks/useMidiPlayback";

const {
  deleteSongBuilderSongMock,
  downloadBlobMock,
  exportToMidiMock,
  listSongBuilderSongsMock,
  saveSongBuilderSongMock,
} = vi.hoisted(() => ({
  deleteSongBuilderSongMock: vi.fn(),
  downloadBlobMock: vi.fn(),
  exportToMidiMock: vi.fn(() => new Blob(["midi"], { type: "audio/midi" })),
  listSongBuilderSongsMock: vi.fn(),
  saveSongBuilderSongMock: vi.fn(),
}));

vi.mock("../hooks/useMidiPlayback", () => ({
  useMidiPlayback: vi.fn(),
}));

vi.mock("../lib/db", () => ({
  deleteSongBuilderSong: deleteSongBuilderSongMock,
  listSongBuilderSongs: listSongBuilderSongsMock,
  saveSongBuilderSong: saveSongBuilderSongMock,
}));

vi.mock("../lib/audioExport", () => ({
  downloadBlob: downloadBlobMock,
  exportToMidi: exportToMidiMock,
  sanitizeExportFilename: (name: string, fallback = "riff") => (
    name.replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "-") || fallback
  ),
}));

const useMidiPlaybackMock = vi.mocked(useMidiPlayback);

vi.setConfig({ testTimeout: 10000 });

function recorderProps(overrides: Partial<RecorderProps> = {}): RecorderProps {
  return {
    state: "idle",
    onStart: vi.fn(),
    onStop: vi.fn(),
    onImport: vi.fn(),
    isImporting: false,
    error: null,
    autoProcess: false,
    onAutoProcessChange: vi.fn(),
    storageFormat: "pcm",
    onStorageFormatChange: vi.fn(),
    recorderState: "idle",
    isLoading: false,
    hasPendingAnalysis: false,
    onAnalyze: vi.fn(),
    profileId: "guitar",
    onProfileChange: vi.fn(),
    ...overrides,
  };
}

describe("SongBuilder", () => {
  const playback = {
    load: vi.fn(),
    play: vi.fn(),
    previewNote: vi.fn(),
    setLooping: vi.fn(),
    stop: vi.fn(),
    isPlaying: false,
    isLooping: false,
    currentTimeS: 0,
    duration: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    listSongBuilderSongsMock.mockResolvedValue([]);
    saveSongBuilderSongMock.mockResolvedValue(undefined);
    deleteSongBuilderSongMock.mockResolvedValue(undefined);
    useMidiPlaybackMock.mockReturnValue(playback);
  });

  it("renders mobile builder views, capture controls, and an empty builder state", () => {
    render(
      <SongBuilder
        chordTimeline={[]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    const mobileViews = screen.getByRole("navigation", { name: /builder mobile views/i });
    expect(within(mobileViews).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Record",
      "Sequence",
      "Explore",
      "Add",
    ]);
    expect(within(mobileViews).getByRole("link", { name: /record/i })).toHaveAttribute("href", "#builder-capture");
    expect(within(mobileViews).getByRole("link", { name: /sequence/i })).toHaveAttribute("href", "#builder-sequence");
    expect(screen.getByRole("heading", { level: 2, name: /record chords/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start recording/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import audio file/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /add a chord by hand/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "C" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Major" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: /add c major to builder sequence/i })).toBeInTheDocument();
    expect(screen.getByText(/record or import chords/i)).toBeInTheDocument();
    expect(playback.load).toHaveBeenCalledWith([]);
    expect(screen.getByRole("textbox", { name: /builder song title/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save builder song/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /export builder song as midi/i })).toBeDisabled();
  });

  it("adds a manual chord to the sequence and opens it in the chord lab", () => {
    render(
      <SongBuilder
        chordTimeline={[]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: "Bb" }));
    fireEvent.click(screen.getByRole("radio", { name: "Minor 7" }));
    fireEvent.click(screen.getByRole("button", { name: /add bb minor 7 to builder sequence/i }));

    expect(screen.getByRole("list", { name: /detected chord sequence/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /focus bb minor 7/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: /focused builder chord bb minor 7/i })).toBeInTheDocument();
    expect(screen.getByText(/manual chord · 1 beat/i)).toBeInTheDocument();
    expect(screen.getByText(/manual entry/i)).toBeInTheDocument();
    expect(playback.load).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ pitchClass: "Bb" }),
        expect.objectContaining({ pitchClass: "Db" }),
        expect.objectContaining({ pitchClass: "F" }),
        expect.objectContaining({ pitchClass: "Ab" }),
      ])
    );
  });

  it("saves a manual builder song to IndexedDB-backed storage", async () => {
    listSongBuilderSongsMock
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce([]);

    render(
      <SongBuilder
        chordTimeline={[]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add c major to builder sequence/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /builder song title/i }), {
      target: { value: "Pocket Chorus" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save builder song/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/saved pocket chorus/i);
    expect(saveSongBuilderSongMock).toHaveBeenCalledWith(expect.objectContaining({
      name: "Pocket Chorus",
      version: 1,
      items: [expect.objectContaining({ chord: "CM", label: "C Major" })],
    }));
    expect(listSongBuilderSongsMock).toHaveBeenCalledTimes(2);
  });

  it("loads a saved builder song back into the sequence", async () => {
    listSongBuilderSongsMock.mockResolvedValueOnce([
      {
        id: "saved-1",
        name: "Saved Hook",
        createdAt: 1,
        updatedAt: 2,
        version: 1,
        items: [
          {
            id: "g",
            chord: "GM",
            label: "G Major",
            sourceStartTimeS: 0,
            sourceEndTimeS: 1,
            playbackBeats: 1,
          },
        ],
      },
    ]);

    render(
      <SongBuilder
        chordTimeline={[]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: /load saved hook/i }));

    expect(screen.getByRole("textbox", { name: /builder song title/i })).toHaveValue("Saved Hook");
    expect(screen.getByRole("button", { name: /focus g major/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("status")).toHaveTextContent(/loaded saved hook/i);
    expect(playback.stop).toHaveBeenCalledTimes(1);
    expect(playback.setLooping).toHaveBeenCalledWith(false);
  });

  it("exports the current builder song as MIDI and JSON with sanitized filenames", () => {
    render(
      <SongBuilder
        chordTimeline={[]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add c major to builder sequence/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /builder song title/i }), {
      target: { value: "My Hook!" },
    });

    fireEvent.click(screen.getByRole("button", { name: /export builder song as midi/i }));
    fireEvent.click(screen.getByRole("button", { name: /export builder song as json/i }));

    expect(exportToMidiMock).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ pitchClass: "C" }),
      expect.objectContaining({ pitchClass: "E" }),
      expect.objectContaining({ pitchClass: "G" }),
    ]));
    expect(downloadBlobMock).toHaveBeenNthCalledWith(1, expect.any(Blob), "My-Hook.mid");
    expect(downloadBlobMock).toHaveBeenNthCalledWith(2, expect.any(Blob), "My-Hook.json");
  });

  it("keeps manual chords editable with existing suggestions", () => {
    render(
      <SongBuilder
        chordTimeline={[]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /add c major to builder sequence/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cadd9 added ninth/i }));

    expect(screen.getByRole("button", { name: /focus c add9/i })).toBeInTheDocument();
    expect(playback.load).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ pitchClass: "C" }),
        expect.objectContaining({ pitchClass: "D" }),
        expect.objectContaining({ pitchClass: "E" }),
        expect.objectContaining({ pitchClass: "G" }),
      ])
    );
  });

  it("renders detected chords as editable sequence cards", () => {
    render(
      <SongBuilder
        chordTimeline={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 },
          { chord: "GM", label: "G Major", startTimeS: 0.8, endTimeS: 1.4 },
        ]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    const sequence = screen.getByRole("list", { name: /detected chord sequence/i });
    expect(within(sequence).getByText("C Major")).toBeInTheDocument();
    expect(within(sequence).getByText("G Major")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play builder preview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop builder preview immediately/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /keep builder preview looping/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(playback.load).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ pitchClass: "C" }),
        expect.objectContaining({ pitchClass: "G" }),
      ])
    );
  });

  it("exposes an accessible loop jam toggle for builder playback", () => {
    render(
      <SongBuilder
        chordTimeline={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 },
          { chord: "GM", label: "G Major", startTimeS: 0.8, endTimeS: 1.4 },
        ]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /keep builder preview looping/i }));

    expect(playback.setLooping).toHaveBeenCalledWith(true);
  });

  it("keeps the loop jam workspace active while applying focus suggestions", () => {
    useMidiPlaybackMock.mockReturnValue({
      ...playback,
      isPlaying: true,
      isLooping: true,
    });

    render(
      <SongBuilder
        chordTimeline={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 },
        ]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /focus c major/i }));
    expect(screen.getByRole("button", { name: /turn off builder preview loop/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent(/loop stays live/i);

    fireEvent.click(screen.getByRole("button", { name: /Cadd9 added ninth/i }));

    expect(screen.getByRole("button", { name: /focus c add9/i })).toBeInTheDocument();
    expect(playback.stop).not.toHaveBeenCalled();
    expect(playback.load).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ pitchClass: "D" })])
    );

    fireEvent.click(screen.getByRole("button", { name: /stop builder preview immediately/i }));

    expect(playback.stop).toHaveBeenCalledTimes(1);
    expect(playback.setLooping).not.toHaveBeenCalledWith(false);
  });

  it("moves, duplicates, and deletes sequence cards with inline controls", () => {
    render(
      <SongBuilder
        chordTimeline={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 },
          { chord: "GM", label: "G Major", startTimeS: 0.8, endTimeS: 1.4 },
        ]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    const sequence = screen.getByRole("list", { name: /detected chord sequence/i });

    fireEvent.click(screen.getByRole("button", { name: /move c major right/i }));
    expect(within(sequence).getAllByText(/Major/).map((node) => node.textContent)).toEqual(["G Major", "C Major"]);

    fireEvent.click(screen.getByRole("button", { name: /duplicate c major/i }));
    expect(screen.getAllByText("C Major")).toHaveLength(2);

    fireEvent.click(screen.getAllByRole("button", { name: /delete c major/i })[0]);
    expect(screen.getAllByText("C Major")).toHaveLength(1);
  });

  it("marks the currently playing chord in the sequence", () => {
    useMidiPlaybackMock.mockReturnValue({
      ...playback,
      isPlaying: true,
      currentTimeS: 1.05,
    });

    render(
      <SongBuilder
        chordTimeline={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 },
          { chord: "GM", label: "G Major", startTimeS: 0.8, endTimeS: 1.4 },
        ]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    expect(screen.getByText("G Major").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/playing now/i)).toBeInTheDocument();
    expect(screen.getByText("C Major").closest("li")).not.toHaveAttribute("aria-current");
  });

  it("shuffles sequence cards from the sequence toolbar", () => {
    render(
      <SongBuilder
        chordTimeline={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 },
          { chord: "GM", label: "G Major", startTimeS: 0.8, endTimeS: 1.4 },
          { chord: "Am", label: "A Minor", startTimeS: 1.5, endTimeS: 2.1 },
        ]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    const initialOrder = screen.getAllByText(/C Major|G Major|A Minor/).map((node) => node.textContent);

    fireEvent.click(screen.getByRole("button", { name: /^shuffle$/i }));

    expect(screen.getAllByText(/C Major|G Major|A Minor/).map((node) => node.textContent)).not.toEqual(initialOrder);
  });

  it("opens and closes an accessible chord focus view from a chord card", () => {
    render(
      <SongBuilder
        chordTimeline={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 },
        ]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    const focusButton = screen.getByRole("button", { name: /focus c major/i });
    expect(focusButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(focusButton);

    expect(focusButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: /focused builder chord c major/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /shape c major/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /editable chord notes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1 c root/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close focus view for c major/i }));

    expect(screen.queryByRole("region", { name: /focused builder chord c major/i })).not.toBeInTheDocument();
  });

  it("applies a focus suggestion to the card label and generated playback notes", () => {
    render(
      <SongBuilder
        chordTimeline={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 },
        ]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /focus c major/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cadd9 added ninth/i }));

    expect(screen.getByRole("button", { name: /focus c add9/i })).toBeInTheDocument();
    expect(playback.load).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ pitchClass: "C" }),
        expect.objectContaining({ pitchClass: "D" }),
        expect.objectContaining({ pitchClass: "E" }),
        expect.objectContaining({ pitchClass: "G" }),
      ])
    );
  });

  it("uses touch-friendly focused note edits when regenerating playback notes", () => {
    render(
      <SongBuilder
        chordTimeline={[
          { chord: "CM", label: "C Major", startTimeS: 0, endTimeS: 0.7 },
        ]}
        recorderProps={recorderProps()}
        isLoading={false}
        progress={0}
        onLoadDemo={vi.fn()}
        showDemoFallback={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /focus c major/i }));
    fireEvent.click(screen.getByRole("button", { name: /2 e third/i }));

    expect(screen.getByRole("button", { name: /2 e third/i })).toHaveAttribute("aria-pressed", "false");
    expect(playback.load).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ pitchClass: "C" }),
        expect.objectContaining({ pitchClass: "G" }),
      ])
    );
    expect(playback.load).toHaveBeenLastCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ pitchClass: "E" })])
    );

    fireEvent.change(screen.getByLabelText(/add tone/i), { target: { value: "Bb" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));

    expect(playback.load).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ pitchClass: "Bb" })])
    );
  });
});