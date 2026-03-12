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
    const session = makeSession({ name: "Take 1:00 PM", primaryChord: "Am" });

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
    expect(screen.getByText(/2 notes/)).toBeInTheDocument();
    // Dropdown should not be visible
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /select a session/i }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("lists all sessions in dropdown", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /select a session/i }));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);

    // Should be sorted newest-first
    expect(options[0]).toHaveTextContent("Take C");
    expect(options[1]).toHaveTextContent("Take B");
    expect(options[2]).toHaveTextContent("Take A");
  });

  it("highlights active session", () => {
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

    fireEvent.click(screen.getByText("Take A"));

    const options = screen.getAllByRole("option");
    const activeOption = options.find((o) => o.getAttribute("aria-selected") === "true");
    expect(activeOption).toBeDefined();
    expect(activeOption).toHaveTextContent("Take A");
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

    fireEvent.click(screen.getByRole("button", { name: /select a session/i }));
    fireEvent.click(screen.getByRole("option", { name: /take x/i }));

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

    fireEvent.click(screen.getByRole("button", { name: /select a session/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /take x/i }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("calls onDelete when clicking delete button", () => {
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

    fireEvent.click(screen.getByRole("button", { name: /select a session/i }));
    fireEvent.click(screen.getByLabelText(`Delete ${session.name}`));

    expect(onDelete).toHaveBeenCalledWith(session.id);
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

    fireEvent.click(screen.getByRole("button", { name: /select a session/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows fallback trigger text when no active session", () => {
    const session = makeSession();

    render(
      <SessionPicker
        sessions={[session]}
        activeSessionId={null}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Select a session")).toBeInTheDocument();
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
    expect(screen.getByText(/— · 2 notes/)).toBeInTheDocument();
  });
});
