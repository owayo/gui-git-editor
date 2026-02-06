import { useCallback, useEffect } from "react";

interface MergeShortcutHandlers {
	onSave?: () => void;
	onCancel?: () => void;
	onNextConflict?: () => void;
	onPrevConflict?: () => void;
}

export function useMergeKeyboardShortcuts({
	onSave,
	onCancel,
	onNextConflict,
	onPrevConflict,
}: MergeShortcutHandlers) {
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			const { key, ctrlKey, metaKey, altKey } = event;
			const modKey = ctrlKey || metaKey;

			// Ctrl/Cmd + S: Save and exit
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

			// Alt + ArrowDown: Next conflict
			if (altKey && key === "ArrowDown") {
				event.preventDefault();
				onNextConflict?.();
				return;
			}

			// Alt + ArrowUp: Previous conflict
			if (altKey && key === "ArrowUp") {
				event.preventDefault();
				onPrevConflict?.();
				return;
			}
		},
		[onSave, onCancel, onNextConflict, onPrevConflict],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);
}
