import { useEffect, useMemo, useState } from "react";
import { Minus } from "lucide-react";
import { Chord } from "tonal";
import {
  getChordSuggestions,
  type ChordSuggestion,
  type ChordSuggestionCategory,
} from "../lib/chordSuggestions";
import "./ChordFocusView.css";

const CATEGORY_LABELS: Record<ChordSuggestionCategory, string> = {
  variate: "Variate",
  "spice-up": "Spice up",
  "spice-down": "Spice down",
  phrasing: "Phrasing",
};

const CATEGORY_HINTS: Record<ChordSuggestionCategory, string> = {
  variate: "Change the harmony without leaving the pocket.",
  "spice-up": "Add color tones for a bigger hold.",
  "spice-down": "Strip it back for a tighter riff.",
  phrasing: "Move the bass or shape the handoff.",
};

const NOTE_CHOICES = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];
const DEFAULT_CATEGORY_ORDER: ChordSuggestionCategory[] = ["variate", "spice-up", "spice-down", "phrasing"];

export interface ChordFocusMeta {
  eyebrow?: string;
  subtitle?: string;
  detail?: string;
}

export interface ChordFocusNote {
  id: string;
  label: string;
  role?: string;
  muted?: boolean;
}

export interface ChordFocusViewProps {
  chordName: string | null;
  meta?: ChordFocusMeta;
  selectedSuggestionId?: string | null;
  selectedSuggestionChord?: string | null;
  suggestionCategories?: ChordSuggestionCategory[];
  limitPerCategory?: number;
  notes?: ChordFocusNote[];
  showNoteEditor?: boolean;
  onApplySuggestion?: (suggestion: ChordSuggestion) => void;
  onNotesChange?: (notes: ChordFocusNote[]) => void;
  onNoteToggle?: (note: ChordFocusNote, notes: ChordFocusNote[]) => void;
}

function notesFromChord(chordSymbol: string | null): ChordFocusNote[] {
  if (!chordSymbol) {
    return [];
  }

  const chord = Chord.get(chordSymbol);
  if (chord.empty) {
    return [];
  }

  return chord.notes.map((label, index) => ({
    id: `${label}-${index}`,
    label,
    role: index === 0 ? "root" : index === 1 ? "third" : index === 2 ? "fifth" : "color",
  }));
}

function getSelectedNoteValue(notes: ChordFocusNote[]) {
  return NOTE_CHOICES.find((choice) => !notes.some((note) => note.label === choice)) ?? NOTE_CHOICES[0];
}

export function ChordFocusView({
  chordName,
  meta,
  selectedSuggestionId,
  selectedSuggestionChord,
  suggestionCategories,
  limitPerCategory,
  notes,
  showNoteEditor = true,
  onApplySuggestion,
  onNotesChange,
  onNoteToggle,
}: ChordFocusViewProps) {
  const suggestionResult = useMemo(
    () => getChordSuggestions(chordName, { categories: suggestionCategories, limitPerCategory }),
    [chordName, limitPerCategory, suggestionCategories],
  );
  const suggestedNotes = useMemo(
    () => notesFromChord(suggestionResult.parsed?.symbol ?? chordName),
    [chordName, suggestionResult.parsed?.symbol],
  );
  const [localNotes, setLocalNotes] = useState<ChordFocusNote[]>(notes ?? suggestedNotes);
  const [newNote, setNewNote] = useState(getSelectedNoteValue(notes ?? suggestedNotes));

  useEffect(() => {
    const nextNotes = notes ?? suggestedNotes;
    setLocalNotes(nextNotes);
    setNewNote(getSelectedNoteValue(nextNotes));
  }, [notes, suggestedNotes]);

  const visibleCategories = suggestionCategories ?? DEFAULT_CATEGORY_ORDER;
  const hasSuggestions = suggestionResult.suggestions.length > 0;
  const displayName = chordName?.trim() || "No chord selected";
  const parsedName = suggestionResult.parsed?.symbol;

  const commitNotes = (nextNotes: ChordFocusNote[]) => {
    setLocalNotes(nextNotes);
    onNotesChange?.(nextNotes);
    setNewNote(getSelectedNoteValue(nextNotes));
  };

  const handleNoteToggle = (noteId: string) => {
    const nextNotes = localNotes.map((note) => (
      note.id === noteId ? { ...note, muted: !note.muted } : note
    ));
    const toggledNote = nextNotes.find((note) => note.id === noteId);
    commitNotes(nextNotes);
    if (toggledNote) {
      onNoteToggle?.(toggledNote, nextNotes);
    }
  };

  const handleAddNote = () => {
    const nextNote: ChordFocusNote = {
      id: `${newNote}-${Date.now()}`,
      label: newNote,
      role: "color",
    };

    commitNotes([...localNotes, nextNote]);
  };

  const handleRemoveNote = (noteId: string) => {
    commitNotes(localNotes.filter((note) => note.id !== noteId));
  };

  return (
    <section className="chord-focus" aria-label={chordName ? `Focused chord ${chordName}` : "Focused chord"}>
      <header className="chord-focus__hero">
        <div className="chord-focus__copy">
          <p className="chord-focus__eyebrow">{meta?.eyebrow ?? "Chord focus"}</p>
          <h2>{displayName}</h2>
          <div className="chord-focus__meta">
            {parsedName && <span>{parsedName}</span>}
            {meta?.subtitle && <span>{meta.subtitle}</span>}
            {meta?.detail && <span>{meta.detail}</span>}
          </div>
        </div>
        <div className="chord-focus__badge" aria-hidden="true">
          {localNotes.length || "—"}
          <span>tones</span>
        </div>
      </header>

      <div className="chord-focus__body">
        <section className="chord-focus__panel chord-focus__panel--suggestions" aria-labelledby="chord-focus-suggestions">
          <div className="chord-focus__panel-heading">
            <p className="chord-focus__section-kicker">Try next</p>
            <h3 id="chord-focus-suggestions">Suggestion pads</h3>
          </div>

          {hasSuggestions ? (
            <div className="chord-focus__categories">
              {visibleCategories.map((category) => {
                const suggestions = suggestionResult.suggestions.filter((suggestion) => suggestion.category === category);

                return (
                  <section className="chord-focus-category" key={category} aria-label={`${CATEGORY_LABELS[category]} suggestions`}>
                    <div className="chord-focus-category__header">
                      <h4>{CATEGORY_LABELS[category]}</h4>
                      <p>{CATEGORY_HINTS[category]}</p>
                    </div>
                    <div className="chord-focus-category__buttons">
                      {suggestions.length > 0 ? suggestions.map((suggestion) => {
                        const isSelected = suggestion.id === selectedSuggestionId || suggestion.chord === selectedSuggestionChord;

                        return (
                          <button
                            type="button"
                            className="chord-focus-suggestion"
                            key={suggestion.id}
                            aria-label={`${suggestion.chord} ${suggestion.relationship}`}
                            aria-pressed={isSelected}
                            onClick={() => onApplySuggestion?.(suggestion)}
                          >
                            <span className="chord-focus-suggestion__chord">{suggestion.chord}</span>
                            <span className="chord-focus-suggestion__name">{suggestion.relationship}</span>
                            <span className="chord-focus-suggestion__description">{suggestion.description}</span>
                          </button>
                        );
                      }) : (
                        <p className="chord-focus-category__empty">No moves in this lane.</p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="chord-focus__empty" role="status">
              <strong>No suggestion lanes yet.</strong>
              <span>{suggestionResult.unsupportedReason ?? "This chord does not have reusable moves yet."}</span>
            </div>
          )}
        </section>

        {showNoteEditor && (
          <section className="chord-focus__panel chord-focus__panel--notes" aria-labelledby="chord-focus-notes">
            <div className="chord-focus__panel-heading">
              <p className="chord-focus__section-kicker">Touch edit</p>
              <h3 id="chord-focus-notes">Note lanes</h3>
            </div>
            <p className="chord-focus__note-help">
              Tap a note to mute or revive it. Builder uses these tones for the focused chord preview.
            </p>

            {localNotes.length > 0 ? (
              <div className="chord-focus-notes" role="group" aria-label="Editable chord notes">
                {localNotes.map((note, index) => (
                  <div className="chord-focus-note-lane" key={note.id}>
                    <button
                      type="button"
                      className="chord-focus-note"
                      aria-label={`${index + 1} ${note.label} ${note.role ?? "tone"}`}
                      aria-pressed={!note.muted}
                      onClick={() => handleNoteToggle(note.id)}
                    >
                      <span className="chord-focus-note__index">{index + 1}</span>
                      <span className="chord-focus-note__label">{note.label}</span>
                      <span className="chord-focus-note__role">{note.role ?? "tone"}</span>
                    </button>
                    <button
                      type="button"
                      className="chord-focus-note-lane__remove"
                      onClick={() => handleRemoveNote(note.id)}
                      aria-label={`Remove note ${note.label}`}
                    >
                      <Minus size={20} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="chord-focus__empty chord-focus__empty--compact" role="status">
                <strong>No editable notes.</strong>
                <span>Add a color tone to sketch the chord shape.</span>
              </div>
            )}

            <div className="chord-focus-add-note">
              <label>
                Add tone
                <select value={newNote} onChange={(event) => setNewNote(event.target.value)}>
                  {NOTE_CHOICES.map((noteName) => (
                    <option value={noteName} key={noteName}>
                      {noteName}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={handleAddNote}>
                Add note
              </button>
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
