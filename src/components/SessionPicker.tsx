import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Check, Trash2 } from "lucide-react";
import { formatDuration } from "../lib/formatDuration";
import type { RiffSession } from "../lib/db";
import "./SessionPicker.css";

function getAudioFormatLabel(session: RiffSession): string {
  if (session.audioFormat !== "compressed") {
    return "PCM";
  }

  if (session.audioMime?.includes("webm")) {
    return "WebM";
  }

  if (session.audioMime?.includes("mp4") || session.audioMime?.includes("aac")) {
    return "M4A";
  }

  if (session.audioMime?.includes("ogg")) {
    return "Ogg";
  }

  return "Compressed";
}

export interface SessionPickerProps {
  sessions: RiffSession[];
  activeSessionId: string | null;
  onLoad: (session: RiffSession) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

export function SessionPicker({
  sessions,
  activeSessionId,
  onLoad,
  onDelete,
}: SessionPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Sort newest-first by createdAt
  const sorted = [...sessions].sort((a, b) => b.createdAt - a.createdAt);

  const activeSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId) ?? null
    : null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleSelect = useCallback(
    (session: RiffSession) => {
      onLoad(session);
      setOpen(false);
    },
    [onLoad],
  );

  if (sessions.length === 0) {
    return null;
  }

  // When a session is loaded the trigger shows its name; otherwise a static label.
  const triggerLabel = activeSession ? activeSession.name : "Saved riffs";

  const triggerMeta = activeSession
    ? [
        activeSession.primaryChord ?? "—",
        `${activeSession.notes.length} notes`,
        getAudioFormatLabel(activeSession),
      ].join(" · ")
    : `${sessions.length} saved`;

  return (
    <div className="session-picker" ref={wrapperRef}>
      <button
        type="button"
        className="session-picker-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        ref={triggerRef}
      >
        <span className="session-picker-trigger__info">
          <span className="session-picker-trigger__name">{triggerLabel}</span>
          <span className="session-picker-trigger__meta">{triggerMeta}</span>
        </span>
        <span className="session-picker-trigger__chevron" aria-hidden="true">
          {open ? (
            <ChevronUp size={16} strokeWidth={2} />
          ) : (
            <ChevronDown size={16} strokeWidth={2} />
          )}
        </span>
      </button>

      {open && (
        <ul
          className="session-picker-dropdown"
          role="list"
          aria-label="Saved riffs"
        >
          {sorted.map((session) => {
            const isActive = session.id === activeSessionId;

            return (
              <li
                key={session.id}
                className={`session-picker-item-row${isActive ? " session-picker-item-row--active" : ""}`}
              >
                {/* Load button — takes up the full remaining width */}
                <button
                  type="button"
                  className={`session-picker-item${isActive ? " session-picker-item--active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => handleSelect(session)}
                >
                  <span
                    className="session-picker-item__check"
                    aria-hidden="true"
                  >
                    {isActive && <Check size={14} strokeWidth={2.5} />}
                  </span>

                  <span className="session-picker-item__details">
                    <span className="session-picker-item__name">
                      {session.name}
                    </span>
                    <span className="session-picker-item__meta">
                      {session.primaryChord ?? "—"} ·{" "}
                      {session.notes.length} notes ·{" "}
                      {formatDuration(session.durationS)} ·{" "}
                      {getAudioFormatLabel(session)}
                    </span>
                  </span>
                </button>

                {/* Delete button — sibling, not child, of the load button */}
                <button
                  type="button"
                  className="session-picker-item__delete"
                  aria-label={`Delete ${session.name}`}
                  onClick={() => onDelete(session.id)}
                >
                  <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
