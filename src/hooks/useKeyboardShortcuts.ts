import { useEffect, useCallback } from "react";

interface ShortcutHandlers {
  onSave?: () => void;
  onCancel?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export function useKeyboardShortcuts({
  onSave,
  onCancel,
  onUndo,
  onRedo,
}: ShortcutHandlers) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const { key, ctrlKey, metaKey, shiftKey } = event;
      const modKey = ctrlKey || metaKey;

      // Ctrl/Cmd + S: Save
      if (modKey && key === "s") {
        event.preventDefault();
        onSave?.();
        return;
      }

      // Escape: Cancel
      if (key === "Escape") {
        event.preventDefault();
        onCancel?.();
        return;
      }

      // Ctrl/Cmd + Z: Undo
      if (modKey && key === "z" && !shiftKey) {
        event.preventDefault();
        onUndo?.();
        return;
      }

      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y: Redo
      if ((modKey && key === "z" && shiftKey) || (modKey && key === "y")) {
        event.preventDefault();
        onRedo?.();
        return;
      }
    },
    [onSave, onCancel, onUndo, onRedo]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
