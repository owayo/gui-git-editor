import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConflictRegion } from "../types/git";
import * as ipc from "../types/ipc";
import { useMergeStore } from "./mergeStore";

function makeConflict(
	id: number,
	startLine: number,
	localContent: string,
	remoteContent: string,
	baseContent: string | null = null,
): ConflictRegion {
	const localLineCount =
		localContent === "" ? 0 : localContent.split("\n").length;
	const remoteLineCount =
		remoteContent === "" ? 0 : remoteContent.split("\n").length;
	const localStartLine = startLine + 1;
	const localEndLine = localStartLine + localLineCount;
	const baseLineCount =
		baseContent === null
			? null
			: baseContent === ""
				? 0
				: baseContent.split("\n").length;
	const baseStartLine = baseLineCount === null ? null : localEndLine + 1;
	const baseEndLine =
		baseStartLine === null || baseLineCount === null
			? null
			: baseStartLine + baseLineCount;
	const remoteStartLine =
		baseEndLine === null ? localEndLine + 1 : baseEndLine + 1;
	const remoteEndLine = remoteStartLine + remoteLineCount;

	return {
		id,
		startLine,
		localStartLine,
		localEndLine,
		baseStartLine,
		baseEndLine,
		remoteStartLine,
		remoteEndLine,
		endLine: remoteEndLine,
		localContent,
		baseContent,
		remoteContent,
		resolved: false,
	};
}

function resetMergeStore() {
	useMergeStore.setState({
		localContent: null,
		remoteContent: null,
		baseContent: null,
		mergedContent: null,
		mergedPath: null,
		language: "plaintext",
		conflicts: [],
		currentConflictIndex: 0,
		allResolved: false,
		isLoading: false,
		isSaving: false,
		error: null,
		isDirty: false,
		localLabel: "LOCAL",
		remoteLabel: "REMOTE",
		codexAvailable: null,
		localBlame: null,
		remoteBlame: null,
		resolvedReplacements: {},
	});
}

describe("mergeStore", () => {
	beforeEach(() => {
		resetMergeStore();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("先に解決したコンフリクト分だけ後続コンフリクトの行番号をシフトする", () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"A",
			"=======",
			"B",
			">>>>>>> REMOTE",
			"mid",
			"<<<<<<< LOCAL",
			"X",
			"=======",
			"Y",
			">>>>>>> REMOTE",
			"after",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "A", "B"), makeConflict(1, 7, "X", "Y")],
		});

		useMergeStore.getState().acceptLocal(0);

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe(
			[
				"before",
				"A",
				"mid",
				"<<<<<<< LOCAL",
				"X",
				"=======",
				"Y",
				">>>>>>> REMOTE",
				"after",
			].join("\n"),
		);
		expect(state.conflicts.find((c) => c.id === 1)?.startLine).toBe(3);
	});

	it("複数コンフリクトを連続で解決しても内容を壊さない", () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"A",
			"=======",
			"B",
			">>>>>>> REMOTE",
			"mid",
			"<<<<<<< LOCAL",
			"X",
			"=======",
			"Y",
			">>>>>>> REMOTE",
			"after",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "A", "B"), makeConflict(1, 7, "X", "Y")],
		});

		useMergeStore.getState().acceptLocal(0);
		useMergeStore.getState().acceptLocal(1);

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe(
			["before", "A", "mid", "X", "after"].join("\n"),
		);
		expect(state.conflicts.every((c) => c.resolved)).toBe(true);
		expect(state.allResolved).toBe(true);
	});

	it("revert は保存した行アンカーを使って元の位置に戻す", () => {
		const mergedContent = [
			"same",
			"<<<<<<< LOCAL",
			"same",
			"=======",
			"other",
			">>>>>>> REMOTE",
			"tail",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "same", "other")],
		});

		useMergeStore.getState().acceptLocal(0);
		expect(useMergeStore.getState().mergedContent).toBe(
			["same", "same", "tail"].join("\n"),
		);

		useMergeStore.getState().revertConflict(0);

		expect(useMergeStore.getState().mergedContent).toBe(mergedContent);
		expect(useMergeStore.getState().conflicts[0].resolved).toBe(false);
	});

	it("解決後に手動編集で行がずれても revert は解決済みブロックを再特定して復元する", () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"A",
			"=======",
			"B",
			">>>>>>> REMOTE",
			"after",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "A", "B")],
		});

		useMergeStore.getState().acceptLocal(0);
		useMergeStore
			.getState()
			.updateMergedContent(["header", "before", "A", "after"].join("\n"));

		useMergeStore.getState().revertConflict(0);

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe(
			[
				"header",
				"before",
				"<<<<<<< LOCAL",
				"A",
				"=======",
				"B",
				">>>>>>> REMOTE",
				"after",
			].join("\n"),
		);
		expect(state.conflicts[0].resolved).toBe(false);
		expect(state.conflicts[0].startLine).toBe(2);
	});

	it("diff3 形式のコンフリクトを revert すると BASE セクション込みで復元する", () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"local",
			"||||||| BASE",
			"base",
			"=======",
			"remote",
			">>>>>>> REMOTE",
			"after",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "local", "remote", "base")],
		});

		useMergeStore.getState().acceptLocal(0);
		expect(useMergeStore.getState().mergedContent).toBe(
			["before", "local", "after"].join("\n"),
		);

		useMergeStore.getState().revertConflict(0);

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe(mergedContent);
		expect(state.conflicts[0].resolved).toBe(false);
		expect(state.conflicts[0].baseStartLine).toBe(4);
		expect(state.conflicts[0].baseEndLine).toBe(5);
	});

	it("reload 時は parse 後に再採番された ID ではなく内容で外部解決を判定する", async () => {
		const reloadedContent = [
			"A",
			"mid",
			"<<<<<<< LOCAL",
			"X",
			"=======",
			"Y",
			">>>>>>> REMOTE",
		].join("\n");
		vi.spyOn(ipc, "readFile").mockResolvedValue({
			ok: true,
			data: {
				path: "/tmp/merged",
				content: reloadedContent,
				file_type: "merge",
			},
		});
		vi.spyOn(ipc, "parseConflicts").mockResolvedValue({
			ok: true,
			data: {
				conflicts: [makeConflict(0, 2, "X", "Y")],
				hasConflicts: true,
				totalConflicts: 1,
			},
		});

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			conflicts: [makeConflict(0, 0, "A", "B"), makeConflict(1, 6, "X", "Y")],
		});

		await useMergeStore.getState().reloadMergedFile();

		const state = useMergeStore.getState();
		const resolved = state.conflicts.find((c) => c.resolved);
		const unresolved = state.conflicts.find((c) => !c.resolved);
		expect(resolved?.localContent).toBe("A");
		expect(resolved?.remoteContent).toBe("B");
		expect(unresolved?.localContent).toBe("X");
		expect(unresolved?.remoteContent).toBe("Y");
	});

	it("reload 時に既存の resolved ID と parse 済み unresolved ID が衝突しても重複させない", async () => {
		const reloadedContent = [
			"A",
			"mid",
			"<<<<<<< LOCAL",
			"X",
			"=======",
			"Y",
			">>>>>>> REMOTE",
		].join("\n");
		vi.spyOn(ipc, "readFile").mockResolvedValue({
			ok: true,
			data: {
				path: "/tmp/merged",
				content: reloadedContent,
				file_type: "merge",
			},
		});
		vi.spyOn(ipc, "parseConflicts").mockResolvedValue({
			ok: true,
			data: {
				conflicts: [makeConflict(0, 2, "X", "Y")],
				hasConflicts: true,
				totalConflicts: 1,
			},
		});

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			conflicts: [
				{ ...makeConflict(0, 0, "A", "B"), resolved: true },
				makeConflict(1, 6, "X", "Y"),
			],
			resolvedReplacements: {
				0: { text: "A", startLine: 0, lineCount: 1 },
			},
		});

		await useMergeStore.getState().reloadMergedFile();

		const ids = useMergeStore.getState().conflicts.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("reload 時に解決済みコンフリクトが再出現した場合は stale な resolved を保持しない", async () => {
		const reloadedContent = [
			"<<<<<<< LOCAL",
			"A",
			"=======",
			"B",
			">>>>>>> REMOTE",
		].join("\n");
		vi.spyOn(ipc, "readFile").mockResolvedValue({
			ok: true,
			data: {
				path: "/tmp/merged",
				content: reloadedContent,
				file_type: "merge",
			},
		});
		vi.spyOn(ipc, "parseConflicts").mockResolvedValue({
			ok: true,
			data: {
				conflicts: [makeConflict(0, 0, "A", "B")],
				hasConflicts: true,
				totalConflicts: 1,
			},
		});

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			conflicts: [{ ...makeConflict(0, 0, "A", "B"), resolved: true }],
			resolvedReplacements: {
				0: { text: "A", startLine: 0, lineCount: 1 },
			},
		});

		await useMergeStore.getState().reloadMergedFile();

		const state = useMergeStore.getState();
		expect(state.conflicts).toHaveLength(1);
		expect(state.conflicts[0].resolved).toBe(false);
		expect(state.conflicts[0].id).toBe(0);
		expect(state.resolvedReplacements).toEqual({});
	});
});
