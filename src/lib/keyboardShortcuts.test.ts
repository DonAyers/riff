import { describe, expect, it } from "vitest";
import {
  getShortcutAction,
  isEditableShortcutTarget,
  isInteractiveShortcutTarget,
} from "./keyboardShortcuts";

function createKeyboardEvent(
  key: string,
  target: EventTarget | null = document.body,
  overrides: Partial<KeyboardEvent> = {}
) {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    key,
    metaKey: false,
    repeat: false,
    target,
    ...overrides,
  };
}

describe("keyboardShortcuts", () => {
  it("matches supported shortcut keys case-insensitively", () => {
    expect(getShortcutAction(createKeyboardEvent("r"))).toBe("record");
    expect(getShortcutAction(createKeyboardEvent("P"))).toBe("playback");
    expect(getShortcutAction(createKeyboardEvent("a"))).toBe("analyze");
    expect(getShortcutAction(createKeyboardEvent("E"))).toBe("export");
  });

  it("ignores unsupported keys and modified key presses", () => {
    expect(getShortcutAction(createKeyboardEvent("x"))).toBeNull();
    expect(getShortcutAction(createKeyboardEvent("r", document.body, { ctrlKey: true }))).toBeNull();
    expect(getShortcutAction(createKeyboardEvent("p", document.body, { metaKey: true }))).toBeNull();
    expect(getShortcutAction(createKeyboardEvent("a", document.body, { altKey: true }))).toBeNull();
    expect(getShortcutAction(createKeyboardEvent("e", document.body, { repeat: true }))).toBeNull();
    expect(
      getShortcutAction(createKeyboardEvent("r", document.body, { defaultPrevented: true }))
    ).toBeNull();
  });

  it("treats text fields and editable regions as unsafe shortcut targets", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(textarea)).toBe(true);
    expect(isEditableShortcutTarget(editable)).toBe(true);

    expect(getShortcutAction(createKeyboardEvent("r", input))).toBeNull();
    expect(getShortcutAction(createKeyboardEvent("a", textarea))).toBeNull();
    expect(getShortcutAction(createKeyboardEvent("p", editable))).toBeNull();
  });

  it("treats buttons and links as unsafe shortcut targets", () => {
    const button = document.createElement("button");
    const link = document.createElement("a");
    link.href = "#export";

    expect(isInteractiveShortcutTarget(button)).toBe(true);
    expect(isInteractiveShortcutTarget(link)).toBe(true);

    expect(getShortcutAction(createKeyboardEvent("r", button))).toBeNull();
    expect(getShortcutAction(createKeyboardEvent("e", link))).toBeNull();
  });
});
