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

			// Ctrl/Cmd + S: 保存して終了
			if (modKey && key === "s") {
				event.preventDefault();
				onSave?.();
				return;
			}

			// Escape: キャンセル（モーダル表示中はモーダル側に委ねる）
			if (key === "Escape") {
				if (document.querySelector("[aria-modal='true']")) {
					return;
				}
				event.preventDefault();
				onCancel?.();
				return;
			}

			// Alt + ArrowDown: 次のコンフリクト
			if (altKey && key === "ArrowDown") {
				event.preventDefault();
				onNextConflict?.();
				return;
			}

			// Alt + ArrowUp: 前のコンフリクト
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
