import { renderHook } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function dispatchKeydown(options: KeyboardEventInit) {
	window.dispatchEvent(new KeyboardEvent("keydown", options));
}

describe("useKeyboardShortcuts", () => {
	const handlers = {
		onSave: vi.fn(),
		onCancel: vi.fn(),
		onUndo: vi.fn(),
		onRedo: vi.fn(),
	};

	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe("Cmd/Ctrl + S (Save)", () => {
		it("calls onSave with metaKey", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "s", metaKey: true });
			});

			expect(handlers.onSave).toHaveBeenCalledOnce();
		});

		it("calls onSave with ctrlKey", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "s", ctrlKey: true });
			});

			expect(handlers.onSave).toHaveBeenCalledOnce();
		});

		it("does not call onSave without modifier", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "s" });
			});

			expect(handlers.onSave).not.toHaveBeenCalled();
		});
	});

	describe("Escape (Cancel)", () => {
		it("calls onCancel on Escape", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "Escape" });
			});

			expect(handlers.onCancel).toHaveBeenCalledOnce();
		});

		it("does not require modifier keys", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "Escape", metaKey: false, ctrlKey: false });
			});

			expect(handlers.onCancel).toHaveBeenCalledOnce();
		});

		it("モーダルが開いている場合は onCancel を呼ばない", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			// aria-modal 要素を追加してモーダル表示状態を模倣
			const modal = document.createElement("div");
			modal.setAttribute("aria-modal", "true");
			document.body.appendChild(modal);

			act(() => {
				dispatchKeydown({ key: "Escape" });
			});

			expect(handlers.onCancel).not.toHaveBeenCalled();

			document.body.removeChild(modal);
		});

		it("モーダルが閉じた後は onCancel が呼ばれる", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			// モーダルを追加して削除
			const modal = document.createElement("div");
			modal.setAttribute("aria-modal", "true");
			document.body.appendChild(modal);
			document.body.removeChild(modal);

			act(() => {
				dispatchKeydown({ key: "Escape" });
			});

			expect(handlers.onCancel).toHaveBeenCalledOnce();
		});
	});

	describe("Cmd/Ctrl + Z (Undo)", () => {
		it("calls onUndo with metaKey", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "z", metaKey: true });
			});

			expect(handlers.onUndo).toHaveBeenCalledOnce();
		});

		it("calls onUndo with ctrlKey", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "z", ctrlKey: true });
			});

			expect(handlers.onUndo).toHaveBeenCalledOnce();
		});

		it("does not call onUndo when shiftKey is also pressed", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "z", metaKey: true, shiftKey: true });
			});

			expect(handlers.onUndo).not.toHaveBeenCalled();
		});

		it("does not hijack undo inside input elements", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			const input = document.createElement("input");
			document.body.append(input);

			const event = new KeyboardEvent("keydown", {
				key: "z",
				metaKey: true,
				bubbles: true,
				cancelable: true,
			});
			const spy = vi.spyOn(event, "preventDefault");

			act(() => {
				input.dispatchEvent(event);
			});

			expect(handlers.onUndo).not.toHaveBeenCalled();
			expect(spy).not.toHaveBeenCalled();

			input.remove();
		});
	});

	describe("Cmd/Ctrl + Shift + Z (Redo)", () => {
		it("calls onRedo with metaKey + shiftKey + z", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "z", metaKey: true, shiftKey: true });
			});

			expect(handlers.onRedo).toHaveBeenCalledOnce();
		});

		it("calls onRedo with ctrlKey + shiftKey + z", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "z", ctrlKey: true, shiftKey: true });
			});

			expect(handlers.onRedo).toHaveBeenCalledOnce();
		});

		it("calls onRedo with metaKey + y", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "y", metaKey: true });
			});

			expect(handlers.onRedo).toHaveBeenCalledOnce();
		});

		it("calls onRedo with ctrlKey + y", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "y", ctrlKey: true });
			});

			expect(handlers.onRedo).toHaveBeenCalledOnce();
		});

		it("does not hijack redo inside textarea elements", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			const textarea = document.createElement("textarea");
			document.body.append(textarea);

			const event = new KeyboardEvent("keydown", {
				key: "z",
				metaKey: true,
				shiftKey: true,
				bubbles: true,
				cancelable: true,
			});
			const spy = vi.spyOn(event, "preventDefault");

			act(() => {
				textarea.dispatchEvent(event);
			});

			expect(handlers.onRedo).not.toHaveBeenCalled();
			expect(spy).not.toHaveBeenCalled();

			textarea.remove();
		});
	});

	describe("handlers undefined", () => {
		it("does not crash when onSave is undefined", () => {
			renderHook(() => useKeyboardShortcuts({}));

			expect(() => {
				act(() => {
					dispatchKeydown({ key: "s", metaKey: true });
				});
			}).not.toThrow();
		});

		it("does not crash when onCancel is undefined", () => {
			renderHook(() => useKeyboardShortcuts({}));

			expect(() => {
				act(() => {
					dispatchKeydown({ key: "Escape" });
				});
			}).not.toThrow();
		});

		it("does not crash when onUndo is undefined", () => {
			renderHook(() => useKeyboardShortcuts({}));

			expect(() => {
				act(() => {
					dispatchKeydown({ key: "z", metaKey: true });
				});
			}).not.toThrow();
		});

		it("does not crash when onRedo is undefined", () => {
			renderHook(() => useKeyboardShortcuts({}));

			expect(() => {
				act(() => {
					dispatchKeydown({ key: "z", metaKey: true, shiftKey: true });
				});
			}).not.toThrow();
		});
	});

	describe("preventDefault", () => {
		it("calls preventDefault on Cmd+S", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			const event = new KeyboardEvent("keydown", {
				key: "s",
				metaKey: true,
				cancelable: true,
			});
			const spy = vi.spyOn(event, "preventDefault");

			act(() => {
				window.dispatchEvent(event);
			});

			expect(spy).toHaveBeenCalledOnce();
		});

		it("calls preventDefault on Escape", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			const event = new KeyboardEvent("keydown", {
				key: "Escape",
				cancelable: true,
			});
			const spy = vi.spyOn(event, "preventDefault");

			act(() => {
				window.dispatchEvent(event);
			});

			expect(spy).toHaveBeenCalledOnce();
		});

		it("calls preventDefault on Cmd+Z", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			const event = new KeyboardEvent("keydown", {
				key: "z",
				metaKey: true,
				cancelable: true,
			});
			const spy = vi.spyOn(event, "preventDefault");

			act(() => {
				window.dispatchEvent(event);
			});

			expect(spy).toHaveBeenCalledOnce();
		});

		it("calls preventDefault on Cmd+Shift+Z", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			const event = new KeyboardEvent("keydown", {
				key: "z",
				metaKey: true,
				shiftKey: true,
				cancelable: true,
			});
			const spy = vi.spyOn(event, "preventDefault");

			act(() => {
				window.dispatchEvent(event);
			});

			expect(spy).toHaveBeenCalledOnce();
		});

		it("does not call preventDefault on unrelated keys", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			const event = new KeyboardEvent("keydown", {
				key: "a",
				cancelable: true,
			});
			const spy = vi.spyOn(event, "preventDefault");

			act(() => {
				window.dispatchEvent(event);
			});

			expect(spy).not.toHaveBeenCalled();
		});

		it("keeps save shortcut active inside editable elements", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			const textarea = document.createElement("textarea");
			document.body.append(textarea);

			const event = new KeyboardEvent("keydown", {
				key: "s",
				metaKey: true,
				bubbles: true,
				cancelable: true,
			});
			const spy = vi.spyOn(event, "preventDefault");

			act(() => {
				textarea.dispatchEvent(event);
			});

			expect(handlers.onSave).toHaveBeenCalledOnce();
			expect(spy).toHaveBeenCalledOnce();

			textarea.remove();
		});
	});

	describe("cleanup", () => {
		it("removes event listener on unmount", () => {
			const { unmount } = renderHook(() => useKeyboardShortcuts(handlers));

			unmount();

			act(() => {
				dispatchKeydown({ key: "s", metaKey: true });
			});

			expect(handlers.onSave).not.toHaveBeenCalled();
		});
	});

	describe("no interference between shortcuts", () => {
		it("does not call other handlers when Cmd+S is pressed", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "s", metaKey: true });
			});

			expect(handlers.onSave).toHaveBeenCalledOnce();
			expect(handlers.onCancel).not.toHaveBeenCalled();
			expect(handlers.onUndo).not.toHaveBeenCalled();
			expect(handlers.onRedo).not.toHaveBeenCalled();
		});

		it("does not call other handlers when Escape is pressed", () => {
			renderHook(() => useKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "Escape" });
			});

			expect(handlers.onCancel).toHaveBeenCalledOnce();
			expect(handlers.onSave).not.toHaveBeenCalled();
			expect(handlers.onUndo).not.toHaveBeenCalled();
			expect(handlers.onRedo).not.toHaveBeenCalled();
		});
	});
});
