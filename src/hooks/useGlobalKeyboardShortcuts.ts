import { useEffect, useRef } from "react";
import { getShortcutAction, type ShortcutAction } from "../lib/keyboardShortcuts";

interface ShortcutHandler {
  enabled: boolean;
  run: () => void;
}

type ShortcutHandlerMap = Partial<Record<ShortcutAction, ShortcutHandler>>;

interface UseGlobalKeyboardShortcutsOptions {
  disabled?: boolean;
  handlers: ShortcutHandlerMap;
}

export function useGlobalKeyboardShortcuts({
  disabled = false,
  handlers,
}: UseGlobalKeyboardShortcutsOptions): void {
  const handlersRef = useRef<ShortcutHandlerMap>(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = getShortcutAction(event);
      if (!action) {
        return;
      }

      const handler = handlersRef.current[action];
      if (!handler || !handler.enabled) {
        return;
      }

      event.preventDefault();
      handler.run();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled]);
}
