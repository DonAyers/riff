import { useEffect, useMemo, useState, type DragEvent } from "react";
import { ArrowLeft, ArrowRight, Copy, Download, FolderOpen, GripVertical, Play, Plus, Repeat2, Save, Shuffle, Square, Trash2, Undo2, X } from "lucide-react";
import { ChordFocusView, type ChordFocusNote } from "./ChordFocusView";
import { Playback } from "./Playback";
import { ProgressBar } from "./ProgressBar";
import { Recorder, type RecorderProps } from "./Recorder";
import { useMidiPlayback } from "../hooks/useMidiPlayback";
import type { ChordEvent } from "../lib/chordDetector";
import type { ChordSuggestion } from "../lib/chordSuggestions";
import {
  deleteSongBuilderSong,
  listSongBuilderSongs,
  saveSongBuilderSong,
  type SongBuilderSong,
} from "../lib/db";
import {
  downloadBlob,
  exportToMidi,
  sanitizeExportFilename,
} from "../lib/audioExport";
import {
  chordNotesFromSymbol,
  chordTimelineToBuilderItems,
  createManualSongBuilderChord,
  deleteSongBuilderChord,
  duplicateSongBuilderChord,
  getCurrentSongBuilderChordId,
  MANUAL_SONG_BUILDER_CHORD_QUALITIES,
  moveSongBuilderChord,
  reverseSongBuilderChords,
  shuffleSongBuilderChords,
  songBuilderChordsToPlaybackNotes,
  type SongBuilderChord,
  type SongBuilderChordNote,
} from "../lib/songBuilder";
import "./SongBuilder.css";

interface SongBuilderProps {
  chordTimeline: ChordEvent[];
  recorderProps: RecorderProps;
  isLoading: boolean;
  progress: number;
  onLoadDemo: () => void;
  showDemoFallback: boolean;
}

const BUILDER_LOADING_COPY = {
  eyebrow: "Analysis in progress",
  label: "Finding chords",
  description: "Riff is listening for the chord sequence. Builder cards will appear when analysis finishes.",
} as const;

const MANUAL_ROOT_CHOICES = [
  { label: "C", value: "C" },
  { label: "C#/Db", value: "Db" },
  { label: "D", value: "D" },
  { label: "Eb", value: "Eb" },
  { label: "E", value: "E" },
  { label: "F", value: "F" },
  { label: "F#/Gb", value: "F#" },
  { label: "G", value: "G" },
  { label: "Ab", value: "Ab" },
  { label: "A", value: "A" },
  { label: "Bb", value: "Bb" },
  { label: "B", value: "B" },
] as const;

function createBuilderSongId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `builder-song-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneBuilderItems(items: readonly SongBuilderChord[]): SongBuilderChord[] {
  return items.map((item) => ({
    ...item,
    editedNotes: item.editedNotes?.map((note) => ({ ...note })),
  }));
}

function getFallbackSongName(): string {
  return `Builder song ${new Date().toLocaleDateString()}`;
}

export function SongBuilder({
  chordTimeline,
  recorderProps,
  isLoading,
  progress,
  onLoadDemo,
  showDemoFallback,
}: SongBuilderProps) {
  const sourceItems = useMemo(() => chordTimelineToBuilderItems(chordTimeline), [chordTimeline]);
  const [items, setItems] = useState<SongBuilderChord[]>(sourceItems);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [focusedChordId, setFocusedChordId] = useState<string | null>(null);
  const [manualRoot, setManualRoot] = useState<string>(MANUAL_ROOT_CHOICES[0].value);
  const [manualQualityId, setManualQualityId] = useState(MANUAL_SONG_BUILDER_CHORD_QUALITIES[0].id);
  const [manualSerial, setManualSerial] = useState(0);
  const [, setShuffleSeed] = useState(0);
  const [songName, setSongName] = useState("");
  const [savedSongs, setSavedSongs] = useState<SongBuilderSong[]>([]);
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [songStatus, setSongStatus] = useState<string | null>(null);
  const playbackNotes = useMemo(() => songBuilderChordsToPlaybackNotes(items), [items]);
  const {
    currentTimeS,
    duration,
    isPlaying,
    load,
    play,
    setLooping,
    stop,
    isLooping,
  } = useMidiPlayback("guitar");

  useEffect(() => {
    setItems(sourceItems);
    setFocusedChordId((currentId) => (
      currentId && sourceItems.some((item) => item.id === currentId) ? currentId : null
    ));
    if (sourceItems.length > 0) {
      setActiveSongId(null);
      setSongName("");
      setSongStatus(null);
    }
  }, [sourceItems]);

  useEffect(() => {
    let cancelled = false;

    void listSongBuilderSongs()
      .then((songs) => {
        if (!cancelled && songs.length > 0) {
          setSavedSongs(songs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSongStatus("Saved builder songs are unavailable on this device.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    load(playbackNotes);
    if (playbackNotes.length === 0) {
      setLooping(false);
    }
  }, [load, playbackNotes, setLooping]);

  const currentChordId = useMemo(
    () => getCurrentSongBuilderChordId(items, currentTimeS, isPlaying),
    [currentTimeS, isPlaying, items],
  );
  const focusedChord = useMemo(
    () => items.find((item) => item.id === focusedChordId) ?? null,
    [focusedChordId, items],
  );
  const isJamMode = isLooping && focusedChord !== null;
  const selectedManualQuality = MANUAL_SONG_BUILDER_CHORD_QUALITIES.find((quality) => quality.id === manualQualityId)
    ?? MANUAL_SONG_BUILDER_CHORD_QUALITIES[0];
  const manualPreviewSymbol = `${manualRoot}${selectedManualQuality.suffix}`;

  const moveItem = (fromIndex: number, toIndex: number) => {
    setItems((current) => moveSongBuilderChord(current, fromIndex, toIndex));
  };

  const moveById = (activeId: string, targetId: string) => {
    setItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === activeId);
      const toIndex = current.findIndex((item) => item.id === targetId);
      return moveSongBuilderChord(current, fromIndex, toIndex);
    });
  };

  const handleDragStart = (event: DragEvent<HTMLLIElement>, id: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggingId(id);
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault();
    const activeId = event.dataTransfer.getData("text/plain");
    if (activeId && activeId !== targetId) {
      moveById(activeId, targetId);
    }
    setDraggingId(null);
  };

  const shuffleItems = () => {
    setShuffleSeed((seed) => {
      const nextSeed = seed + 1;
      setItems((current) => shuffleSongBuilderChords(current, nextSeed));
      return nextSeed;
    });
  };

  const updateFocusedChord = (updater: (item: SongBuilderChord) => SongBuilderChord) => {
    if (!focusedChordId) return;
    setItems((current) => current.map((item) => (item.id === focusedChordId ? updater(item) : item)));
  };

  const handleApplySuggestion = (suggestion: ChordSuggestion) => {
    updateFocusedChord((item) => ({
      ...item,
      chord: suggestion.chord,
      label: suggestion.displayName,
      editedNotes: chordNotesFromSymbol(suggestion.chord),
    }));
  };

  const handleFocusedNotesChange = (notes: ChordFocusNote[]) => {
    const editedNotes = notes.map((note): SongBuilderChordNote => ({
      id: note.id,
      label: note.label,
      role: note.role,
      muted: note.muted,
    }));
    updateFocusedChord((item) => ({ ...item, editedNotes }));
  };

  const addManualChord = () => {
    const nextIndex = items.length + manualSerial;
    const manualChord = createManualSongBuilderChord({
      root: manualRoot,
      quality: selectedManualQuality,
      index: nextIndex,
    });

    setItems((current) => [...current, manualChord]);
    setFocusedChordId(manualChord.id);
    setManualSerial((serial) => serial + 1);
  };

  const refreshSavedSongs = async (): Promise<SongBuilderSong[]> => {
    const songs = await listSongBuilderSongs();
    setSavedSongs(songs);
    return songs;
  };

  const saveCurrentSong = async () => {
    if (items.length === 0) {
      setSongStatus("Add at least one chord before saving.");
      return;
    }

    const now = Date.now();
    const existingSong = activeSongId ? savedSongs.find((song) => song.id === activeSongId) : null;
    const trimmedName = songName.trim();
    const nextSong: SongBuilderSong = {
      id: existingSong?.id ?? createBuilderSongId(),
      name: trimmedName || existingSong?.name || getFallbackSongName(),
      createdAt: existingSong?.createdAt ?? now,
      updatedAt: now,
      version: 1,
      items: cloneBuilderItems(items),
    };

    try {
      await saveSongBuilderSong(nextSong);
      await refreshSavedSongs();
      setActiveSongId(nextSong.id);
      setSongName(nextSong.name);
      setSongStatus(`Saved ${nextSong.name}.`);
    } catch {
      setSongStatus("Could not save this builder song.");
    }
  };

  const loadSavedSong = (song: SongBuilderSong) => {
    stop();
    setLooping(false);
    setItems(cloneBuilderItems(song.items));
    setActiveSongId(song.id);
    setSongName(song.name);
    setFocusedChordId(song.items[0]?.id ?? null);
    setSongStatus(`Loaded ${song.name}.`);
  };

  const deleteSavedSong = async (song: SongBuilderSong) => {
    try {
      await deleteSongBuilderSong(song.id);
      const songs = await refreshSavedSongs();
      if (activeSongId === song.id) {
        setActiveSongId(null);
      }
      setSongStatus(songs.length === 0 ? "Deleted saved song. No builder songs remain." : `Deleted ${song.name}.`);
    } catch {
      setSongStatus("Could not delete that saved builder song.");
    }
  };

  const exportCurrentSongAsMidi = () => {
    if (playbackNotes.length === 0) {
      setSongStatus("Add at least one playable chord before exporting.");
      return;
    }

    const baseName = sanitizeExportFilename(songName.trim() || "builder-song", "builder-song");
    downloadBlob(exportToMidi(playbackNotes), `${baseName}.mid`);
    setSongStatus(`Exported ${baseName}.mid.`);
  };

  const exportCurrentSongAsJson = () => {
    if (items.length === 0) {
      setSongStatus("Add at least one chord before exporting.");
      return;
    }

    const name = songName.trim() || getFallbackSongName();
    const baseName = sanitizeExportFilename(name, "builder-song");
    const blob = new Blob([
      JSON.stringify({
        version: 1,
        name,
        exportedAt: new Date().toISOString(),
        items: cloneBuilderItems(items),
      }, null, 2),
    ], { type: "application/json" });

    downloadBlob(blob, `${baseName}.json`);
    setSongStatus(`Exported ${baseName}.json.`);
  };

  const chordLabTitle = focusedChord ? `Shape ${focusedChord.label}` : "Chord explorer";

  return (
    <div
      className={[
        "song-builder",
        isJamMode ? "song-builder--jam" : "",
        focusedChord ? "song-builder--has-focus" : "",
      ].filter(Boolean).join(" ")}
      aria-label="Song builder workspace"
    >
      <nav className="song-builder__view-nav" aria-label="Builder mobile views">
        <a href="#builder-capture">Record</a>
        <a href="#builder-sequence">Sequence</a>
        <a href="#builder-explorer">Explore</a>
        <a href="#builder-add">Add</a>
      </nav>

      <section className="workspace-pane song-builder__capture song-builder__panel" id="builder-capture" aria-label="Builder capture">
        <div className="workspace-pane__intro">
          <span className="workspace-pane__kicker">Capture</span>
          <h2 className="workspace-pane__title">Record chords</h2>
          <p className="workspace-pane__description">
            Record one chord or a short sequence, then analyze it into builder cards.
          </p>
        </div>
        <div className="recorder-card song-builder__recorder-card">
          <Recorder {...recorderProps} />
          {showDemoFallback && (
            <button
              className="analyze-btn analyze-btn--secondary analyze-btn--demo"
              onClick={onLoadDemo}
              disabled={isLoading || recorderProps.recorderState !== "idle"}
              aria-label="Try demo take"
            >
              <Play size={14} strokeWidth={2} aria-hidden="true" />
              Try demo
            </button>
          )}
          <ProgressBar
            progress={progress}
            visible={isLoading}
            eyebrow={BUILDER_LOADING_COPY.eyebrow}
            label={BUILDER_LOADING_COPY.label}
            description={BUILDER_LOADING_COPY.description}
            ariaLabel="Song builder analysis progress"
          />
        </div>
      </section>

      <section
        className="song-builder__arrangement song-builder__panel"
        id="builder-sequence"
        aria-label="Builder chord sequence"
      >
        <div className="song-builder__arrangement-header">
          <div>
            <span className="workspace-pane__kicker">Sequencer</span>
            <h2 className="workspace-pane__title">Build the sequence</h2>
          </div>
          <div className="song-builder__transport" aria-label="Builder playback controls">
            <Playback
              label="Builder preview"
              isPlaying={isPlaying}
              duration={duration}
              onPlay={play}
              onPause={stop}
              visible={items.length > 0}
            />
            {items.length > 0 && (
              <>
                <button
                  type="button"
                  className="song-builder__stop-button"
                  onClick={stop}
                  disabled={!isPlaying}
                  aria-label="Stop builder preview immediately"
                >
                  <Square size={15} strokeWidth={2.4} fill="currentColor" aria-hidden="true" />
                  <span>Stop</span>
                </button>
                <button
                  type="button"
                  className={[
                    "song-builder__loop-toggle",
                    isLooping ? "song-builder__loop-toggle--active" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => setLooping(!isLooping)}
                  aria-pressed={isLooping}
                  aria-label={isLooping ? "Turn off builder preview loop" : "Keep builder preview looping"}
                >
                  <Repeat2 size={17} strokeWidth={2.2} aria-hidden="true" />
                  <span>{isLooping ? "Looping" : "Loop jam"}</span>
                </button>
              </>
            )}
          </div>
        </div>

        <section className="song-builder__project-panel" aria-label="Builder song save and export">
          <label className="song-builder__name-field">
            <span>Song title</span>
            <input
              type="text"
              value={songName}
              onChange={(event) => setSongName(event.target.value)}
              placeholder="Name this progression"
              aria-label="Builder song title"
            />
          </label>
          <div className="song-builder__project-actions">
            <button
              type="button"
              className="song-builder__project-button song-builder__project-button--primary"
              onClick={() => void saveCurrentSong()}
              disabled={items.length === 0}
              aria-label="Save builder song"
            >
              <Save size={15} strokeWidth={2.3} aria-hidden="true" />
              Save
            </button>
            <button
              type="button"
              className="song-builder__project-button"
              onClick={exportCurrentSongAsMidi}
              disabled={playbackNotes.length === 0}
              aria-label="Export builder song as MIDI"
            >
              <Download size={15} strokeWidth={2.3} aria-hidden="true" />
              MIDI
            </button>
            <button
              type="button"
              className="song-builder__project-button"
              onClick={exportCurrentSongAsJson}
              disabled={items.length === 0}
              aria-label="Export builder song as JSON"
            >
              <Download size={15} strokeWidth={2.3} aria-hidden="true" />
              JSON
            </button>
          </div>
          {songStatus && (
            <p className="song-builder__project-status" role="status" aria-live="polite">
              {songStatus}
            </p>
          )}
          <div className="song-builder__saved-songs" aria-label="Saved builder songs">
            {savedSongs.length > 0 ? (
              savedSongs.map((song) => (
                <div
                  className={[
                    "song-builder__saved-song",
                    activeSongId === song.id ? "song-builder__saved-song--active" : "",
                  ].filter(Boolean).join(" ")}
                  key={song.id}
                >
                  <button type="button" onClick={() => loadSavedSong(song)} aria-label={`Load ${song.name}`}>
                    <FolderOpen size={14} strokeWidth={2.2} aria-hidden="true" />
                    <span>{song.name}</span>
                    <small>{song.items.length} chords</small>
                  </button>
                  <button
                    type="button"
                    className="song-builder__saved-song-delete"
                    onClick={() => void deleteSavedSong(song)}
                    aria-label={`Delete saved builder song ${song.name}`}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              ))
            ) : (
              <p className="song-builder__saved-empty">Saved songs appear here.</p>
            )}
          </div>
        </section>

        {items.length > 0 ? (
          <>
            <div className="song-builder__sequence-workspace">
              <div className="song-builder__sequence-tools" aria-label="Sequence order controls">
                <span className="song-builder__sequence-tools-label">Order</span>
                <button type="button" onClick={shuffleItems} disabled={items.length < 2}>
                  <Shuffle size={15} strokeWidth={2} aria-hidden="true" />
                  Shuffle
                </button>
                <button
                  type="button"
                  onClick={() => setItems((current) => reverseSongBuilderChords(current))}
                  disabled={items.length < 2}
                >
                  <Undo2 size={15} strokeWidth={2} aria-hidden="true" />
                  Reverse
                </button>
                {isLooping && (
                  <span className="song-builder__jam-status" role="status">
                    Loop stays live while you swap chords.
                  </span>
                )}
              </div>
              <ol className="song-builder__sequence" aria-label="Detected chord sequence">
                {items.map((item, index) => (
                  <SongBuilderChordCard
                    key={item.id}
                    item={item}
                    index={index}
                    total={items.length}
                    isCurrent={currentChordId === item.id}
                    isFocused={focusedChordId === item.id}
                    isDragging={draggingId === item.id}
                    onFocusChord={() => setFocusedChordId(item.id)}
                    onMoveLeft={() => moveItem(index, index - 1)}
                    onMoveRight={() => moveItem(index, index + 1)}
                    onDuplicate={() => setItems((current) => duplicateSongBuilderChord(current, item.id))}
                    onDelete={() => setItems((current) => deleteSongBuilderChord(current, item.id))}
                    onDragStart={(event) => handleDragStart(event, item.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, item.id)}
                  />
                ))}
              </ol>
            </div>
          </>
        ) : (
          <div className="song-builder__empty" aria-live="polite">
            <span className="lane-placeholder__kicker">No sequence yet</span>
            <h3>Record or import chords</h3>
            <p>The builder keeps repeated chords in order and turns them into editable cards after analysis. Or add a chord by hand to start writing now.</p>
          </div>
        )}
      </section>

      <section
        className={[
          "song-builder__focus-panel",
          "song-builder__panel",
          focusedChord ? "" : "song-builder__focus-panel--empty",
        ].filter(Boolean).join(" ")}
        id="builder-explorer"
        aria-label={focusedChord ? `Focused builder chord ${focusedChord.label}` : "Builder chord explorer"}
      >
        <div className="song-builder__focus-bar">
          <div>
            <span className="workspace-pane__kicker">Chord lab</span>
            <h3>{chordLabTitle}</h3>
          </div>
          {focusedChord && (
            <button
              type="button"
              className="song-builder__focus-close"
              onClick={() => setFocusedChordId(null)}
              aria-label={`Close focus view for ${focusedChord.label}`}
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
              Close
            </button>
          )}
        </div>
        {focusedChord ? (
          <ChordFocusView
            chordName={focusedChord.chord}
            meta={{
              eyebrow: "Selected builder chord",
              subtitle: isManualChord(focusedChord) ? "Manual entry" : `Source ${formatSeconds(focusedChord.sourceStartTimeS)}`,
              detail: isManualChord(focusedChord) ? "1 beat builder card" : `${formatDuration(focusedChord)} source`,
            }}
            selectedSuggestionChord={focusedChord.chord}
            notes={focusedChord.editedNotes ?? chordNotesFromSymbol(focusedChord.chord)}
            onApplySuggestion={handleApplySuggestion}
            onNotesChange={handleFocusedNotesChange}
          />
        ) : (
          <div className="song-builder__focus-empty">
            <span className="lane-placeholder__kicker">No chord selected</span>
            <h3>Tap a sequence card</h3>
            <p>The explorer opens here so you can variate, spice, simplify, or edit the chord tones without losing the arrangement.</p>
          </div>
        )}
      </section>

      <aside className="song-builder__tools-panel song-builder__panel" aria-label="Builder add chord tools">
        <section className="song-builder__manual-entry" id="builder-add" aria-labelledby="manual-chord-entry-title">
          <div className="song-builder__manual-copy">
            <span className="lane-placeholder__kicker">Manual mode</span>
            <h3 id="manual-chord-entry-title">Add a chord by hand</h3>
            <p>Pick a root and a core shape, then tap Add. The card opens in Chord lab for variations and note edits.</p>
          </div>
          <div className="song-builder__manual-controls">
            <div className="song-builder__manual-group" role="radiogroup" aria-label="Manual chord root">
              {MANUAL_ROOT_CHOICES.map((root) => (
                <button
                  type="button"
                  key={root.value}
                  className={root.value === manualRoot ? "song-builder__manual-pill song-builder__manual-pill--active" : "song-builder__manual-pill"}
                  onClick={() => setManualRoot(root.value)}
                  role="radio"
                  aria-checked={root.value === manualRoot}
                >
                  {root.label}
                </button>
              ))}
            </div>
            <div className="song-builder__manual-group song-builder__manual-group--qualities" role="radiogroup" aria-label="Manual chord quality">
              {MANUAL_SONG_BUILDER_CHORD_QUALITIES.map((quality) => (
                <button
                  type="button"
                  key={quality.id}
                  className={quality.id === manualQualityId ? "song-builder__manual-pill song-builder__manual-pill--active" : "song-builder__manual-pill"}
                  onClick={() => setManualQualityId(quality.id)}
                  role="radio"
                  aria-checked={quality.id === manualQualityId}
                >
                  {quality.label}
                </button>
              ))}
            </div>
          </div>
          <div className="song-builder__manual-add-row">
            <span className="song-builder__manual-preview" aria-label={`Manual chord preview ${manualPreviewSymbol}`}>
              {manualPreviewSymbol}
            </span>
            <button
              type="button"
              className="song-builder__manual-add"
              onClick={addManualChord}
              aria-label={`Add ${manualRoot} ${selectedManualQuality.label} to builder sequence`}
            >
              <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
              Add chord
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

interface SongBuilderChordCardProps {
  item: SongBuilderChord;
  index: number;
  total: number;
  isCurrent: boolean;
  isFocused: boolean;
  isDragging: boolean;
  onFocusChord: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
}

function SongBuilderChordCard({
  item,
  index,
  total,
  isCurrent,
  isFocused,
  isDragging,
  onFocusChord,
  onMoveLeft,
  onMoveRight,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: SongBuilderChordCardProps) {
  return (
    <li
      className={[
        "song-builder-card",
        isCurrent ? "song-builder-card--current" : "",
        isFocused ? "song-builder-card--focused" : "",
        isDragging ? "song-builder-card--dragging" : "",
      ].filter(Boolean).join(" ")}
      aria-current={isCurrent ? "step" : undefined}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="song-builder-card__focus-button"
        onClick={onFocusChord}
        aria-expanded={isFocused}
        aria-label={`Focus ${item.label}`}
      >
        <span className="song-builder-card__header">
          <span className="song-builder-card__index">Step {index + 1}</span>
          {isCurrent && <span className="song-builder-card__now">Playing now</span>}
          <span className="song-builder-card__drag" aria-hidden="true">
            <GripVertical size={16} strokeWidth={2} />
          </span>
        </span>
        <span className="song-builder-card__body">
          <span className="song-builder-card__label">{item.label}</span>
          <span className="song-builder-card__meta">
            {isManualChord(item) ? "Manual chord · 1 beat" : `Source ${formatSeconds(item.sourceStartTimeS)} · ${formatDuration(item)} long`}
          </span>
          <span className="song-builder-card__hint">{isFocused ? "Editing now" : "Tap to zoom"}</span>
        </span>
      </button>
      <div className="song-builder-card__actions" aria-label={`${item.label} controls`}>
        <button type="button" onClick={onMoveLeft} disabled={index === 0} aria-label={`Move ${item.label} left`}>
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          <span>Left</span>
        </button>
        <button type="button" onClick={onMoveRight} disabled={index === total - 1} aria-label={`Move ${item.label} right`}>
          <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
          <span>Right</span>
        </button>
        <button type="button" onClick={onDuplicate} aria-label={`Duplicate ${item.label}`}>
          <Copy size={15} strokeWidth={2} aria-hidden="true" />
          <span>Copy</span>
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete ${item.label}`}>
          <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
          <span>Delete</span>
        </button>
      </div>
    </li>
  );
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

function formatDuration(item: SongBuilderChord): string {
  const durationS = Math.max(0, item.sourceEndTimeS - item.sourceStartTimeS);
  return formatSeconds(durationS);
}

function isManualChord(item: SongBuilderChord): boolean {
  return item.id.startsWith("manual-");
}