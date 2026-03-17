export const KEYBOARD_SHORTCUTS = [
  {
    action: "record",
    key: "r",
    label: "Record",
    description: "Start or stop recording",
  },
  {
    action: "playback",
    key: "p",
    label: "Playback",
    description: "Play or stop the current preview",
  },
  {
    action: "analyze",
    key: "a",
    label: "Analyze",
    description: "Run analysis when audio is ready",
  },
  {
    action: "export",
    key: "e",
    label: "Export",
    description: "Jump to the export buttons",
  },
] as const;

export type ShortcutAction = (typeof KEYBOARD_SHORTCUTS)[number]["action"];

interface ShortcutKeyboardEvent {
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  key: string;
  metaKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
}

const SHORTCUT_ACTIONS = Object.fromEntries(
  KEYBOARD_SHORTCUTS.map(({ action, key }) => [key, action])
) as Record<(typeof KEYBOARD_SHORTCUTS)[number]["key"], ShortcutAction>;

const INTERACTIVE_TARGET_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "summary",
  "textarea",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[role='button']",
  "[role='checkbox']",
  "[role='link']",
  "[role='menuitem']",
  "[role='radio']",
  "[role='switch']",
  "[role='tab']",
] as const;

function isElement(target: EventTarget | null): target is Element {
  return target instanceof Element;
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!isElement(target)) {
    return false;
  }

  const editableParent = target.closest(
    "input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='button']):not([type='submit']):not([type='reset']), textarea, [contenteditable=''], [contenteditable='true']"
  );

  return editableParent !== null;
}

export function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!isElement(target)) {
    return false;
  }

  return target.closest(INTERACTIVE_TARGET_SELECTOR.join(", ")) !== null;
}

export function shouldHandleGlobalShortcut(event: ShortcutKeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat) {
    return false;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }

  if (isEditableShortcutTarget(event.target)) {
    return false;
  }

  if (isInteractiveShortcutTarget(event.target)) {
    return false;
  }

  return true;
}

export function getShortcutAction(event: ShortcutKeyboardEvent): ShortcutAction | null {
  if (!shouldHandleGlobalShortcut(event)) {
    return null;
  }

  const normalizedKey = event.key.toLowerCase();
  return SHORTCUT_ACTIONS[normalizedKey as keyof typeof SHORTCUT_ACTIONS] ?? null;
}
