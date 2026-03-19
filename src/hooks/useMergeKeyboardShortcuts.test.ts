import { renderHook } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMergeKeyboardShortcuts } from "./useMergeKeyboardShortcuts";

function dispatchKeydown(options: KeyboardEventInit) {
	window.dispatchEvent(new KeyboardEvent("keydown", options));
}

describe("useMergeKeyboardShortcuts", () => {
	const handlers = {
		onSave: vi.fn(),
		onCancel: vi.fn(),
		onNextConflict: vi.fn(),
		onPrevConflict: vi.fn(),
	};

	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe("Cmd/Ctrl + S (保存)", () => {
		it("metaKey で onSave を呼ぶ", () => {
			renderHook(() => useMergeKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "s", metaKey: true });
			});

			expect(handlers.onSave).toHaveBeenCalledOnce();
		});

		it("ctrlKey で onSave を呼ぶ", () => {
			renderHook(() => useMergeKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "s", ctrlKey: true });
			});

			expect(handlers.onSave).toHaveBeenCalledOnce();
		});

		it("修飾キーなしでは onSave を呼ばない", () => {
			renderHook(() => useMergeKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "s" });
			});

			expect(handlers.onSave).not.toHaveBeenCalled();
		});
	});

	describe("Escape (キャンセル)", () => {
		it("Escape で onCancel を呼ぶ", () => {
			renderHook(() => useMergeKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "Escape" });
			});

			expect(handlers.onCancel).toHaveBeenCalledOnce();
		});
	});

	describe("Alt + ArrowDown (次のコンフリクト)", () => {
		it("Alt + ArrowDown で onNextConflict を呼ぶ", () => {
			renderHook(() => useMergeKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "ArrowDown", altKey: true });
			});

			expect(handlers.onNextConflict).toHaveBeenCalledOnce();
		});

		it("Alt なしの ArrowDown では呼ばない", () => {
			renderHook(() => useMergeKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "ArrowDown" });
			});

			expect(handlers.onNextConflict).not.toHaveBeenCalled();
		});
	});

	describe("Alt + ArrowUp (前のコンフリクト)", () => {
		it("Alt + ArrowUp で onPrevConflict を呼ぶ", () => {
			renderHook(() => useMergeKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "ArrowUp", altKey: true });
			});

			expect(handlers.onPrevConflict).toHaveBeenCalledOnce();
		});

		it("Alt なしの ArrowUp では呼ばない", () => {
			renderHook(() => useMergeKeyboardShortcuts(handlers));

			act(() => {
				dispatchKeydown({ key: "ArrowUp" });
			});

			expect(handlers.onPrevConflict).not.toHaveBeenCalled();
		});
	});

	describe("ハンドラが未定義の場合", () => {
		it("ハンドラなしでもエラーにならない", () => {
			renderHook(() => useMergeKeyboardShortcuts({}));

			expect(() => {
				act(() => {
					dispatchKeydown({ key: "s", metaKey: true });
					dispatchKeydown({ key: "Escape" });
					dispatchKeydown({ key: "ArrowDown", altKey: true });
					dispatchKeydown({ key: "ArrowUp", altKey: true });
				});
			}).not.toThrow();
		});
	});

	describe("アンマウント時のクリーンアップ", () => {
		it("アンマウント後はイベントに反応しない", () => {
			const { unmount } = renderHook(() => useMergeKeyboardShortcuts(handlers));

			unmount();

			act(() => {
				dispatchKeydown({ key: "s", metaKey: true });
			});

			expect(handlers.onSave).not.toHaveBeenCalled();
		});
	});
});
