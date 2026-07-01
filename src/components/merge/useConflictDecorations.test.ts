import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConflictRegion, ResolvedReplacement } from "../../types/git";
import { useConflictDecorations } from "./useConflictDecorations";

interface CapturedDecoration {
	range: {
		startLineNumber: number;
		startColumn: number;
		endLineNumber: number;
		endColumn: number;
	};
	options: { isWholeLine?: boolean; className?: string };
}

// Monaco の Range を模したモック。行番号だけ検証できれば十分。
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

describe("useConflictDecorations", () => {
	beforeEach(() => {
		lastDecorations = [];
		mockEditor.deltaDecorations.mockClear();
		(window as unknown as { monaco: unknown }).monaco = { Range: MockRange };
	});

	afterEach(() => {
		(window as unknown as { monaco?: unknown }).monaco = undefined;
	});

	function renderRegionDecorations(
		conflicts: ConflictRegion[],
		resolvedReplacements: Record<number, ResolvedReplacement>,
	) {
		renderHook(() =>
			useConflictDecorations(
				{ current: mockEditor } as never,
				conflicts,
				true,
				resolvedReplacements,
			),
		);
		return lastDecorations.filter(
			(d) => d.options.className === "conflict-region-bg",
		);
	}

	it("空文字へ解決したコンフリクト(lineCount:0)は解決済み装飾を描画しない", () => {
		const conflicts = [baseConflict({ id: 0, resolved: true })];
		const regionDecos = renderRegionDecorations(conflicts, {
			0: { text: "", startLine: 3, lineCount: 0 },
		});
		// 空置換は残る行が無いため装飾しない（詰められた無関係な後続行を誤って赤く塗らない）。
		expect(regionDecos).toHaveLength(0);
	});

	it("複数行置換(lineCount:2)は置換範囲の行だけを装飾する", () => {
		const conflicts = [baseConflict({ id: 0, resolved: true })];
		const regionDecos = renderRegionDecorations(conflicts, {
			0: { text: "x\ny", startLine: 3, lineCount: 2 },
		});
		expect(regionDecos).toHaveLength(1);
		// 0-based startLine 3 → Monaco 4 行目から、lineCount 2 行分（4〜5 行目）。
		expect(regionDecos[0].range.startLineNumber).toBe(4);
		expect(regionDecos[0].range.endLineNumber).toBe(5);
	});

	it("1 行置換(lineCount:1)は単一行を装飾する", () => {
		const conflicts = [baseConflict({ id: 0, resolved: true })];
		const regionDecos = renderRegionDecorations(conflicts, {
			0: { text: "only", startLine: 0, lineCount: 1 },
		});
		expect(regionDecos).toHaveLength(1);
		expect(regionDecos[0].range.startLineNumber).toBe(1);
		expect(regionDecos[0].range.endLineNumber).toBe(1);
	});
});
