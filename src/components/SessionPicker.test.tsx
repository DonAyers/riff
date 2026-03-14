import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionPicker } from "./SessionPicker";
import type { RiffSession } from "../lib/db";

function makeSession(overrides: Partial<RiffSession> = {}): RiffSession {
  return {
    id: crypto.randomUUID(),
    name: "Take 3:42 PM",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: "recording",
    durationS: 83,
    audioFileName: null,
    profileId: "guitar",
    notes: [
      { midi: 60, name: "C4", pitchClass: "C", octave: 4, startTimeS: 0, durationS: 0.5, amplitude: 0.8 },
      { midi: 64, name: "E4", pitchClass: "E", octave: 4, startTimeS: 0.5, durationS: 0.5, amplitude: 0.7 },
    ],
    chordTimeline: [],
    keyDetection: null,
    primaryChord: "Cmaj",
    uniqueNoteNames: ["C", "E"],
    ...overrides,
  };
}

describe("SessionPicker", () => {
  it("renders nothing when sessions is empty", () => {
    const { container } = render(
      <SessionPicker
        sessions={[]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows trigger with active session info when collapsed", () => {
    const session = makeSession({
      name: "Take 1:00 PM",
      primaryChord: "Am",
      audioFormat: "compressed",
      audioMime: "audio/webm;codecs=opus",
    });

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={session.id}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Take 1:00 PM")).toBeInTheDocument();
    expect(screen.getByText(/Am/)).toBeInTheDocument();
    expect(screen.getByText(/2 notes · WebM/)).toBeInTheDocument();
    // Dropdown should not be visible
    expect(screen.queryByRole("list", { name: /saved riffs/i })).not.toBeInTheDocument();
  });

  it("opens dropdown on trigger click", () => {
    const session = makeSession();

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /saved riffs/i }));

    expect(screen.getByRole("list", { name: /saved riffs/i })).toBeInTheDocument();
  });

  it("lists all sessions in dropdown sorted newest-first", () => {
    const s1 = makeSession({ name: "Take A", createdAt: 1000 });
    const s2 = makeSession({ name: "Take B", createdAt: 2000 });
    const s3 = makeSession({ name: "Take C", createdAt: 3000 });

    render(
      <SessionPicker
        sessions={[s1, s2, s3]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /saved riffs/i }));

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);

    // Should be sorted newest-first
    expect(items[0]).toHaveTextContent("Take C");
    expect(items[1]).toHaveTextContent("Take B");
    expect(items[2]).toHaveTextContent("Take A");
  });

  it("marks the active session with aria-current", () => {
    const s1 = makeSession({ name: "Take A" });
    const s2 = makeSession({ name: "Take B" });

    render(
      <SessionPicker
        sessions={[s1, s2]}
        activeSessionId={s1.id}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // Trigger shows active session name; click to open
    fireEvent.click(screen.getByRole("button", { name: /take a/i }));

    const activeBtn = screen
      .getAllByRole("button")
      .find((btn) => btn.getAttribute("aria-current") === "true");
    expect(activeBtn).toBeDefined();
    expect(activeBtn).toHaveTextContent("Take A");
  });

  it("calls onLoad when clicking a session item", () => {
    const session = makeSession({ name: "Take X" });
    const onLoad = vi.fn();

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={null}
        onLoad={onLoad}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /saved riffs/i }));
    // Anchor match to start so it doesn't match "Delete Take X"
    fireEvent.click(screen.getByRole("button", { name: /^Take X/i }));

    expect(onLoad).toHaveBeenCalledWith(session);
  });

  it("closes dropdown after selecting a session", () => {
    const session = makeSession({ name: "Take X" });

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /saved riffs/i }));
    expect(screen.getByRole("list", { name: /saved riffs/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Take X/i }));
    expect(screen.queryByRole("list", { name: /saved riffs/i })).not.toBeInTheDocument();
  });

  it("calls onDelete when clicking the delete button", () => {
    const session = makeSession({ name: "Take Y" });
    const onDelete = vi.fn();

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /saved riffs/i }));
    fireEvent.click(screen.getByRole("button", { name: `Delete ${session.name}` }));

    expect(onDelete).toHaveBeenCalledWith(session.id);
  });

  it("delete button is a proper <button>, not a nested interactive element", () => {
    const session = makeSession({ name: "Take Z" });

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /saved riffs/i }));

    const deleteBtn = screen.getByRole("button", { name: `Delete ${session.name}` });
    // Must be a real <button> element, not a span with role="button"
    expect(deleteBtn.tagName).toBe("BUTTON");
    // Must not be nested inside another <button> — closest() includes self, so check parent
    expect(deleteBtn.parentElement?.closest("button")).toBeNull();
  });

  it("closes dropdown on Escape key", () => {
    const session = makeSession();

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /saved riffs/i }));
    expect(screen.getByRole("list", { name: /saved riffs/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("list", { name: /saved riffs/i })).not.toBeInTheDocument();
  });

  it("shows fallback trigger label and count when no active session", () => {
    const session = makeSession();

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Saved riffs")).toBeInTheDocument();
    expect(screen.getByText("1 saved")).toBeInTheDocument();
  });

  it("shows dash when session has no primary chord", () => {
    const session = makeSession({ primaryChord: null });

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={session.id}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // The trigger meta should show "—" for null chord
    expect(screen.getByText(/— · 2 notes · PCM/)).toBeInTheDocument();
  });

  it("shows saved audio format in the dropdown metadata", () => {
    const session = makeSession({
      name: "Compressed Take",
      audioFormat: "compressed",
      audioMime: "audio/webm;codecs=opus",
    });

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /saved riffs/i }));

    expect(screen.getByText(/1:23 · WebM/)).toBeInTheDocument();
  });
});
