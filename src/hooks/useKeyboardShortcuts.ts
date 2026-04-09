import { useCallback, useEffect } from "react";

interface ShortcutHandlers {
	onSave?: () => void;
	onCancel?: () => void;
	onUndo?: () => void;
	onRedo?: () => void;
}

function isEditableTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return (
		target.isContentEditable ||
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement
	);
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
			const isEditable = isEditableTarget(event.target);

			// Ctrl/Cmd + S: 保存
			if (modKey && key === "s") {
				event.preventDefault();
				onSave?.();
				return;
			}

			// Escape: キャンセル（モーダルが開いている場合はモーダル側に委ねる）
			if (key === "Escape") {
				if (document.querySelector("[aria-modal='true']")) {
					return;
				}
				event.preventDefault();
				onCancel?.();
				return;
			}

			// 入力欄ではブラウザやエディタ本来の undo/redo を優先する
			if (isEditable) {
				return;
			}

			// Ctrl/Cmd + Z: 元に戻す
			if (modKey && key === "z" && !shiftKey) {
				event.preventDefault();
				onUndo?.();
				return;
			}

			// Ctrl/Cmd + Shift + Z または Ctrl/Cmd + Y: やり直す
			if ((modKey && key === "z" && shiftKey) || (modKey && key === "y")) {
				event.preventDefault();
				onRedo?.();
				return;
			}
		},
		[onSave, onCancel, onUndo, onRedo],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);
}
