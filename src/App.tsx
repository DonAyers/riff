import { useEffect, useState } from "react";
import { HelpCircle, FlaskConical } from "lucide-react";
import { useRiffSession } from "./hooks/useRiffSession";
import { Recorder } from "./components/Recorder";
import { LaneToggle, type Lane } from "./components/LaneToggle";
import { KeyDisplay } from "./components/KeyDisplay";
import { ChordTimeline } from "./components/ChordTimeline";
import { ChordFretboard } from "./components/ChordFretboard";
import { NoteDisplay } from "./components/NoteDisplay";
import { ChordDisplay } from "./components/ChordDisplay";
import { PianoRoll } from "./components/PianoRoll";
import { ProgressBar } from "./components/ProgressBar";
import { Playback } from "./components/Playback";
import { SavedRiffs } from "./components/SavedRiffs";
import { ExportPanel } from "./components/ExportPanel";
import { OnboardingSheet, hasSeenOnboarding } from "./components/OnboardingSheet";
import { buildLabel } from "./lib/buildInfo";
import { lookupVoicings } from "./lib/chordVoicings";
import { getVariateSuggestions } from "./lib/chordSubstitutions";
import "./styles/App.css";

const TAGLINES = [
  "Every riff, decoded.",
  "Just record it. Frig.",
  "May the frig be with you.",
  "The red light is not judging you.",
  "One more take. For real this time.",
];

const tagline = TAGLINES[Math.floor(Math.random() * TAGLINES.length)];

function App() {
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding());
  const [activeLane, setActiveLane] = useState<Lane>("song");
  const [activeVoicingIndex, setActiveVoicingIndex] = useState(0);
  const [variateOverride, setVariateOverride] = useState<string | null>(null);
  const {
    recorderState,
    handleStart,
    handleStop,
    isLoading,
    progress,
    handleAnalyze,
    notes,
    uniqueNotes,
    chord,
    chordTimeline,
    keyDetection,
    error,
    autoProcess,
    setAutoProcess,
    hasRecording,
    hasPendingAnalysis,
    handleLoadDemoAnalysis,
    handleImport,
    isImporting,
    storageFormat,
    setStorageFormat,
    savedRiffs,
    handleLoadSavedRiff,
    audioPlayback,
    midiPlayback,
    pendingAudio,
    activeRiffName,
    compressedBlob,
    compressedMime,
    profileId,
    setProfileId,
  } = useRiffSession();

  const hasResults = notes.length > 0;
  const showPlaybackStack = !isLoading && (hasRecording || hasResults);
  const isSongLane = activeLane === "song";
  const displayedChord = variateOverride ?? chord;
  const chordVoicings = lookupVoicings(displayedChord);
  const variateSuggestions = getVariateSuggestions(displayedChord);
  const activeVoicing = chordVoicings[activeVoicingIndex] ?? null;

  useEffect(() => {
    setActiveVoicingIndex(0);
    setVariateOverride(null);
  }, [chord]);

  useEffect(() => {
    setActiveVoicingIndex(0);
  }, [variateOverride]);

  const handleNextVoicing = () => {
    if (chordVoicings.length <= 1) return;
    setActiveVoicingIndex((current) => (current + 1) % chordVoicings.length);
  };

  return (
    <div className="app">
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-main">
            <h1><i className="note-icon">♪</i> Riff</h1>
            <button
              className="help-btn"
              onClick={() => setShowOnboarding(true)}
              aria-label="Help — how Riff works"
            >
              <HelpCircle size={18} strokeWidth={1.8} />
            </button>
          </div>
          <p className="tagline">{tagline}</p>
        </header>

        <main className="app-main">
          <section className="workspace-pane workspace-pane--capture" aria-label="Capture">
            <div className="recorder-card">
              <Recorder
                state={isLoading ? "processing" : recorderState}
                onStart={handleStart}
                onStop={() => void handleStop()}
                onImport={(file) => void handleImport(file)}
                isImporting={isImporting}
                error={error}
                autoProcess={autoProcess}
                onAutoProcessChange={setAutoProcess}
                storageFormat={storageFormat}
                onStorageFormatChange={(v) => setStorageFormat(v)}
                recorderState={recorderState}
                isLoading={isLoading}
                hasPendingAnalysis={hasPendingAnalysis}
                onAnalyze={() => void handleAnalyze()}
                profileId={profileId}
                onProfileChange={setProfileId}
              />
              {error && !hasResults && (
                <button
                  className="analyze-btn analyze-btn--secondary analyze-btn--demo"
                  onClick={handleLoadDemoAnalysis}
                  disabled={isLoading || recorderState !== "idle"}
                  aria-label="Try demo take"
                >
                  <FlaskConical size={14} strokeWidth={2} aria-hidden="true" />
                  Try demo
                </button>
              )}
              <ProgressBar progress={progress} visible={isLoading} />
            </div>

            {showPlaybackStack && (
              <div className="playback-stack" aria-label="Playback controls">
                <Playback
                  label="Recording"
                  isPlaying={audioPlayback.isPlaying}
                  duration={audioPlayback.duration}
                  onPlay={audioPlayback.play}
                  onPause={audioPlayback.pause}
                  visible={hasRecording}
                />
                <Playback
                  label="MIDI preview"
                  isPlaying={midiPlayback.isPlaying}
                  duration={midiPlayback.duration}
                  onPlay={midiPlayback.play}
                  onPause={midiPlayback.stop}
                  visible={hasResults}
                />
              </div>
            )}

            <SavedRiffs riffs={savedRiffs} onLoad={handleLoadSavedRiff} />
          </section>

          <section className="workspace-pane workspace-pane--analysis" aria-label="Analysis">
            <div className="analysis-panel">
              <div className="analysis-panel__header">
                <div>
                  <span className="analysis-panel__eyebrow">Guitar focus</span>
                  <h2 className="analysis-panel__title">{isSongLane ? "Song Lane" : "Chord Lane"}</h2>
                </div>
                <LaneToggle activeLane={activeLane} onChange={setActiveLane} />
              </div>

              {hasResults ? (
                <div className="results">
                  {isSongLane ? (
                    <>
                      <div className="results-song-stack">
                        <KeyDisplay result={keyDetection} />
                      </div>
                      <div className="results-summary">
                        <ChordDisplay chordName={chord} />
                        <NoteDisplay
                          notes={uniqueNotes}
                          onNoteClick={(note) => {
                            void midiPlayback.previewNote(note.midi, note.amplitude);
                          }}
                        />
                      </div>
                      <ChordTimeline events={chordTimeline} />
                      <PianoRoll notes={notes} />
                      <ExportPanel
                        notes={notes}
                        pcmAudio={pendingAudio}
                        compressedBlob={compressedBlob}
                        compressedMime={compressedMime}
                        riffName={activeRiffName}
                        visible={hasResults}
                      />
                    </>
                  ) : (
                    <>
                      <div className="results-summary results-summary--chord-lane">
                        <div className="chord-lane-visualization">
                          <ChordDisplay chordName={chord} />
                          {variateSuggestions.length > 0 && (
                            <div className="variate-suggestions">
                              <span className="variate-suggestions__label">Try substituting:</span>
                              <div className="variate-suggestions__list">
                                {variateSuggestions.map((suggestion) => (
                                  <button
                                    key={suggestion.name}
                                    type="button"
                                    className={`variate-btn ${variateOverride === suggestion.name ? "active" : ""}`}
                                    onClick={() => setVariateOverride(suggestion.name)}
                                    title={`${suggestion.type}: ${suggestion.description}`}
                                  >
                                    {suggestion.name}
                                  </button>
                                ))}
                                {variateOverride && (
                                  <button
                                    type="button"
                                    className="variate-btn variate-btn--clear"
                                    onClick={() => setVariateOverride(null)}
                                    title="Clear substitution"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="chord-lane-panel" aria-live="polite">
                          {activeVoicing ? (
                            <>
                              <div className="chord-lane-panel__header">
                                <div>
                                  <span className="chord-lane-panel__kicker">Phrase</span>
                                  <h3>{chord ?? "Detected chord"}</h3>
                                  <p>
                                    Voicing {activeVoicingIndex + 1} of {chordVoicings.length}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  className="analyze-btn analyze-btn--secondary"
                                  onClick={handleNextVoicing}
                                  disabled={chordVoicings.length <= 1}
                                >
                                  Next phrase
                                </button>
                              </div>
                              <ChordFretboard chordName={chord} voicing={activeVoicing} />
                            </>
                          ) : (
                            <div className="lane-placeholder">
                              <span className="lane-placeholder__kicker">Chord lane</span>
                              <h3>No saved voicing yet</h3>
                              <p>This detected chord does not have a seeded guitar shape yet. Add more voicings in the next pass.</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <NoteDisplay
                        notes={uniqueNotes}
                        onNoteClick={(note) => {
                          void midiPlayback.previewNote(note.midi, note.amplitude);
                        }}
                      />
                      <ExportPanel
                        notes={notes}
                        pcmAudio={pendingAudio}
                        compressedBlob={compressedBlob}
                        compressedMime={compressedMime}
                        riffName={activeRiffName}
                        visible={hasResults}
                      />
                    </>
                  )}
                </div>
              ) : (
                <div className="analysis-empty" aria-live="polite">
                  <span className="analysis-empty-icon" aria-hidden="true">♩</span>
                  <span className="analysis-empty-kicker">{isSongLane ? "Song lane ready" : "Chord lane ready"}</span>
                  <p>
                    {isSongLane
                      ? "Record or import a take to surface notes, chord, and timeline analysis."
                      : "Strum or import a chord and this panel will focus on chord identity and guitar-friendly voicings."}
                  </p>
                </div>
              )}
            </div>
          </section>
        </main>

        <div className="build-badge" aria-label={`Build ${buildLabel}`} title={`Build ${buildLabel}`}>
          {buildLabel}
        </div>
      </div>

      {showOnboarding && (
        <OnboardingSheet onClose={() => setShowOnboarding(false)} />
      )}
    </div>
  );
}

export default App;
