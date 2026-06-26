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
			const { ctrlKey, metaKey, shiftKey } = event;
			// Shift 併用時の英字キーは event.key が大文字になる（例: Shift+Z は "Z"）。
			// 比較を安定させるため小文字へ正規化する。
			const key = event.key.toLowerCase();
			const modKey = ctrlKey || metaKey;
			const isEditable = isEditableTarget(event.target);

			// Ctrl/Cmd + S: 保存（Shift 併用は別操作の余地を残すため対象外）
			if (modKey && key === "s" && !shiftKey) {
				event.preventDefault();
				onSave?.();
				return;
			}

			// Escape: キャンセル（モーダルが開いている場合はモーダル側に委ねる）
			if (key === "escape") {
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
			if (
				(modKey && key === "z" && shiftKey) ||
				(modKey && key === "y" && !shiftKey)
			) {
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
