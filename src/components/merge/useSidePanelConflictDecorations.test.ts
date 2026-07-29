import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConflictRegion } from "../../types/git";
import { useSidePanelConflictDecorations } from "./useSidePanelConflictDecorations";

interface CapturedDecoration {
	range: {
		startLineNumber: number;
		startColumn: number;
		endLineNumber: number;
		endColumn: number;
	};
	options: { isWholeLine?: boolean; className?: string };
}

class MockRange {
	constructor(
		public startLineNumber: number,
		public startColumn: number,
		public endLineNumber: number,
		public endColumn: number,
	) {}
}

let lastDecorations: CapturedDecoration[] = [];
const mockEditor = {
	deltaDecorations: vi.fn(
		(_old: string[], decorations: CapturedDecoration[]) => {
			lastDecorations = decorations;
			return decorations.map((_d, i) => `id-${i}`);
		},
	),
	getModel: vi.fn(() => ({})),
};

function baseConflict(overrides: Partial<ConflictRegion>): ConflictRegion {
	return {
		id: 0,
		startLine: 0,
		localStartLine: 1,
		localEndLine: 2,
		baseStartLine: null,
		baseEndLine: null,
		remoteStartLine: 3,
		remoteEndLine: 4,
		endLine: 4,
		localContent: "a",
		baseContent: null,
		remoteContent: "b",
		resolved: false,
		...overrides,
	};
}

describe("useSidePanelConflictDecorations", () => {
	beforeEach(() => {
		lastDecorations = [];
		mockEditor.deltaDecorations.mockClear();
		(window as unknown as { monaco: unknown }).monaco = { Range: MockRange };
	});

	afterEach(() => {
		(window as unknown as { monaco?: unknown }).monaco = undefined;
	});

	function renderRegionDecorations(
		fileContent: string,
		conflicts: ConflictRegion[],
		side: "local" | "remote",
	) {
		renderHook(() =>
			useSidePanelConflictDecorations(
				{ current: mockEditor } as never,
				fileContent,
				conflicts,
				side,
				true,
			),
		);
		return lastDecorations.filter(
			(d) => d.options.className === "conflict-region-bg",
		);
	}

	it("コンフリクト内容末尾の空行もサイドパネル装飾に含める", () => {
		// Rust parser は ["a", ""] を join("\n") で "a\n" として返す（末尾空行は実データ）。
		const fileContent = "top\na\n\nbottom";
		const conflicts = [
			baseConflict({ localContent: "a\n", remoteContent: "" }),
		];
		const decos = renderRegionDecorations(fileContent, conflicts, "local");
		expect(decos).toHaveLength(1);
		// "a"(2 行目) + 末尾空行(3 行目) の 2 行を装飾する。
		expect(decos[0].range.startLineNumber).toBe(2);
		expect(decos[0].range.endLineNumber).toBe(3);
	});

	it("末尾が空行でない通常内容は該当行だけを装飾する", () => {
		const fileContent = "top\na\nbottom";
		const conflicts = [baseConflict({ localContent: "a", remoteContent: "" })];
		const decos = renderRegionDecorations(fileContent, conflicts, "local");
		expect(decos).toHaveLength(1);
		expect(decos[0].range.startLineNumber).toBe(2);
		expect(decos[0].range.endLineNumber).toBe(2);
	});

	it("REMOTE 側でも末尾空行を含めて装飾する", () => {
		const fileContent = "x\nb\n\ny";
		const conflicts = [
			baseConflict({ localContent: "", remoteContent: "b\n" }),
		];
		const decos = renderRegionDecorations(fileContent, conflicts, "remote");
		expect(decos).toHaveLength(1);
		expect(decos[0].range.startLineNumber).toBe(2);
		expect(decos[0].range.endLineNumber).toBe(3);
	});

	it("同じ内容の複数コンフリクトをファイル順に装飾する", () => {
		const conflicts = [
			baseConflict({ id: 0, localContent: "same" }),
			baseConflict({ id: 1, localContent: "same" }),
		];
		const decos = renderRegionDecorations(
			"head\nsame\nmiddle\nsame\ntail",
			conflicts,
			"local",
		);

		expect(decos).toHaveLength(2);
		expect(decos[0].range.startLineNumber).toBe(2);
		expect(decos[1].range.startLineNumber).toBe(4);
	});

	it("アンマウント時に登録済み装飾を解除する", () => {
		const { unmount } = renderHook(() =>
			useSidePanelConflictDecorations(
				{ current: mockEditor } as never,
				"head\na\ntail",
				[baseConflict({ localContent: "a" })],
				"local",
				true,
			),
		);

		expect(mockEditor.deltaDecorations).toHaveBeenCalledTimes(1);
		unmount();
		expect(mockEditor.deltaDecorations).toHaveBeenLastCalledWith(["id-0"], []);
	});

	it("Monaco API が未設定なら装飾処理を開始しない", () => {
		(window as unknown as { monaco?: unknown }).monaco = undefined;

		renderHook(() =>
			useSidePanelConflictDecorations(
				{ current: mockEditor } as never,
				"head\na\ntail",
				[baseConflict({ localContent: "a" })],
				"local",
				true,
			),
		);

		expect(mockEditor.deltaDecorations).not.toHaveBeenCalled();
	});
});
