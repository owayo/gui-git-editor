import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "../types/errors";
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

	// --- acceptRemote ---

	it("acceptRemote はリモート側の内容でコンフリクトを解決する", () => {
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

		useMergeStore.getState().acceptRemote(0);

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe(["before", "B", "after"].join("\n"));
		expect(state.conflicts[0].resolved).toBe(true);
		expect(state.isDirty).toBe(true);
		expect(state.allResolved).toBe(true);
	});

	// --- acceptBoth ---

	it("acceptBoth はローカルとリモートの両方を結合して解決する", () => {
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

		useMergeStore.getState().acceptBoth(0);

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe(["before", "A", "B", "after"].join("\n"));
		expect(state.conflicts[0].resolved).toBe(true);
		expect(state.isDirty).toBe(true);
		expect(state.allResolved).toBe(true);
	});

	it("acceptBoth はローカルが空の場合リモートのみを挿入する", () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"=======",
			"B",
			">>>>>>> REMOTE",
			"after",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "", "B")],
		});

		useMergeStore.getState().acceptBoth(0);

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe(["before", "B", "after"].join("\n"));
	});

	// --- goToNextConflict ---

	it("goToNextConflict は次の未解決コンフリクトに移動する", () => {
		useMergeStore.setState({
			mergedContent: "dummy",
			conflicts: [
				makeConflict(0, 1, "A", "B"),
				makeConflict(1, 7, "X", "Y"),
				makeConflict(2, 13, "P", "Q"),
			],
			currentConflictIndex: 0,
		});

		const startLine = useMergeStore.getState().goToNextConflict();

		const state = useMergeStore.getState();
		expect(state.currentConflictIndex).toBe(1);
		expect(startLine).toBe(7);
	});

	it("goToNextConflict は末尾から先頭にラップアラウンドする", () => {
		useMergeStore.setState({
			mergedContent: "dummy",
			conflicts: [makeConflict(0, 1, "A", "B"), makeConflict(1, 7, "X", "Y")],
			currentConflictIndex: 1,
		});

		const startLine = useMergeStore.getState().goToNextConflict();

		const state = useMergeStore.getState();
		expect(state.currentConflictIndex).toBe(0);
		expect(startLine).toBe(1);
	});

	it("goToNextConflict は解決済みをスキップして未解決に移動する", () => {
		useMergeStore.setState({
			mergedContent: "dummy",
			conflicts: [
				makeConflict(0, 1, "A", "B"),
				{ ...makeConflict(1, 7, "X", "Y"), resolved: true },
				makeConflict(2, 13, "P", "Q"),
			],
			currentConflictIndex: 0,
		});

		const startLine = useMergeStore.getState().goToNextConflict();

		expect(useMergeStore.getState().currentConflictIndex).toBe(2);
		expect(startLine).toBe(13);
	});

	// --- goToPrevConflict ---

	it("goToPrevConflict は前の未解決コンフリクトに移動する", () => {
		useMergeStore.setState({
			mergedContent: "dummy",
			conflicts: [
				makeConflict(0, 1, "A", "B"),
				makeConflict(1, 7, "X", "Y"),
				makeConflict(2, 13, "P", "Q"),
			],
			currentConflictIndex: 2,
		});

		const startLine = useMergeStore.getState().goToPrevConflict();

		expect(useMergeStore.getState().currentConflictIndex).toBe(1);
		expect(startLine).toBe(7);
	});

	it("goToPrevConflict は先頭から末尾にラップアラウンドする", () => {
		useMergeStore.setState({
			mergedContent: "dummy",
			conflicts: [makeConflict(0, 1, "A", "B"), makeConflict(1, 7, "X", "Y")],
			currentConflictIndex: 0,
		});

		const startLine = useMergeStore.getState().goToPrevConflict();

		expect(useMergeStore.getState().currentConflictIndex).toBe(1);
		expect(startLine).toBe(7);
	});

	// --- goToNextConflict / goToPrevConflict: 全て解決済み ---

	it("goToNextConflict は全て解決済みの場合 null を返す", () => {
		useMergeStore.setState({
			mergedContent: "dummy",
			conflicts: [
				{ ...makeConflict(0, 1, "A", "B"), resolved: true },
				{ ...makeConflict(1, 7, "X", "Y"), resolved: true },
			],
			currentConflictIndex: 0,
		});

		const result = useMergeStore.getState().goToNextConflict();
		expect(result).toBeNull();
	});

	it("goToPrevConflict は全て解決済みの場合 null を返す", () => {
		useMergeStore.setState({
			mergedContent: "dummy",
			conflicts: [
				{ ...makeConflict(0, 1, "A", "B"), resolved: true },
				{ ...makeConflict(1, 7, "X", "Y"), resolved: true },
			],
			currentConflictIndex: 1,
		});

		const result = useMergeStore.getState().goToPrevConflict();
		expect(result).toBeNull();
	});

	// --- save ---

	it("save は正常系で IPC 成功時に true を返す", async () => {
		vi.spyOn(ipc, "writeFile").mockResolvedValue({
			ok: true,
			data: undefined as never,
		});

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			mergedContent: "resolved content",
			isDirty: true,
		});

		const result = await useMergeStore.getState().save();

		expect(result).toBe(true);
		const state = useMergeStore.getState();
		expect(state.isDirty).toBe(false);
		expect(state.isSaving).toBe(false);
	});

	it("save は IPC 失敗時に false を返しエラーを設定する", async () => {
		vi.spyOn(ipc, "writeFile").mockResolvedValue({
			ok: false,
			error: {
				code: "IoError",
				details: { message: "write failed" },
			} as AppError,
		});

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			mergedContent: "resolved content",
		});

		const result = await useMergeStore.getState().save();

		expect(result).toBe(false);
		const state = useMergeStore.getState();
		expect(state.error?.details.message).toBe("write failed");
		expect(state.isSaving).toBe(false);
	});

	it("save は mergedPath が null の場合 false を返す", async () => {
		useMergeStore.setState({
			mergedPath: null,
			mergedContent: "some content",
		});

		const result = await useMergeStore.getState().save();

		expect(result).toBe(false);
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

	// --- initMerge ---

	it("initMerge はファイル読み込みとコンフリクト解析を行い状態を初期化する", async () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"A",
			"=======",
			"B",
			">>>>>>> REMOTE",
			"after",
		].join("\n");

		vi.spyOn(ipc, "readMergeFiles").mockResolvedValue({
			ok: true,
			data: {
				local: { path: "/tmp/local", content: "local content" },
				remote: { path: "/tmp/remote", content: "remote content" },
				base: null,
				merged: { path: "/tmp/merged", content: mergedContent },
				language: "typescript",
				localLabel: "HEAD",
				remoteLabel: "feature",
			},
		});
		vi.spyOn(ipc, "parseConflicts").mockResolvedValue({
			ok: true,
			data: {
				conflicts: [makeConflict(0, 1, "A", "B")],
				hasConflicts: true,
				totalConflicts: 1,
			},
		});
		vi.spyOn(ipc, "gitBlameForMerge").mockResolvedValue({
			ok: false,
			error: { code: "Unknown", details: { message: "not available" } },
		});

		await useMergeStore.getState().initMerge("/l", "/r", null, "/m");

		const state = useMergeStore.getState();
		expect(state.localContent).toBe("local content");
		expect(state.remoteContent).toBe("remote content");
		expect(state.mergedContent).toBe(mergedContent);
		expect(state.mergedPath).toBe("/tmp/merged");
		expect(state.language).toBe("typescript");
		expect(state.localLabel).toBe("HEAD");
		expect(state.remoteLabel).toBe("feature");
		expect(state.conflicts).toHaveLength(1);
		expect(state.allResolved).toBe(false);
		expect(state.isLoading).toBe(false);
	});

	it("initMerge はファイル読み込み失敗時にエラーを設定する", async () => {
		vi.spyOn(ipc, "readMergeFiles").mockResolvedValue({
			ok: false,
			error: {
				code: "IoError",
				details: { message: "file not found" },
			} as AppError,
		});

		await useMergeStore.getState().initMerge("/l", "/r", null, "/m");

		const state = useMergeStore.getState();
		expect(state.error?.details.message).toBe("file not found");
		expect(state.isLoading).toBe(false);
	});

	it("initMerge はコンフリクト解析失敗時にエラーを設定する", async () => {
		vi.spyOn(ipc, "readMergeFiles").mockResolvedValue({
			ok: true,
			data: {
				local: { path: "/tmp/local", content: "" },
				remote: { path: "/tmp/remote", content: "" },
				base: null,
				merged: { path: "/tmp/merged", content: "" },
				language: "plaintext",
				localLabel: "LOCAL",
				remoteLabel: "REMOTE",
			},
		});
		vi.spyOn(ipc, "parseConflicts").mockResolvedValue({
			ok: false,
			error: {
				code: "ParseError",
				details: { message: "parse failed" },
			} as AppError,
		});

		await useMergeStore.getState().initMerge("/l", "/r", null, "/m");

		const state = useMergeStore.getState();
		expect(state.error?.details.message).toBe("parse failed");
		expect(state.isLoading).toBe(false);
	});

	// --- checkCodexAvailable ---

	it("checkCodexAvailable は利用可能な場合 true を設定する", async () => {
		vi.spyOn(ipc, "checkCodexAvailable").mockResolvedValue({
			ok: true,
			data: true,
		});

		await useMergeStore.getState().checkCodexAvailable();

		expect(useMergeStore.getState().codexAvailable).toBe(true);
	});

	it("checkCodexAvailable は利用不可の場合 false を設定する", async () => {
		vi.spyOn(ipc, "checkCodexAvailable").mockResolvedValue({
			ok: true,
			data: false,
		});

		await useMergeStore.getState().checkCodexAvailable();

		expect(useMergeStore.getState().codexAvailable).toBe(false);
	});

	it("checkCodexAvailable は IPC 失敗時に false を設定する", async () => {
		vi.spyOn(ipc, "checkCodexAvailable").mockResolvedValue({
			ok: false,
			error: {
				code: "Unknown",
				details: { message: "error" },
			} as AppError,
		});

		await useMergeStore.getState().checkCodexAvailable();

		expect(useMergeStore.getState().codexAvailable).toBe(false);
	});

	// --- openCodexResolve ---

	it("openCodexResolve は mergedPath が null の場合に何もしない", async () => {
		const spy = vi.spyOn(ipc, "openCodexTerminal");
		useMergeStore.setState({ mergedPath: null });

		await useMergeStore.getState().openCodexResolve();

		expect(spy).not.toHaveBeenCalled();
	});

	it("openCodexResolve は IPC 失敗時にエラーを設定する", async () => {
		vi.spyOn(ipc, "openCodexTerminal").mockResolvedValue({
			ok: false,
			error: {
				code: "Unknown",
				details: { message: "codex failed" },
			} as AppError,
		});
		useMergeStore.setState({ mergedPath: "/tmp/merged" });

		await useMergeStore.getState().openCodexResolve();

		expect(useMergeStore.getState().error?.details.message).toBe(
			"codex failed",
		);
	});

	// --- fetchBlame ---

	it("fetchBlame は mergedPath が null の場合に何もしない", async () => {
		const spy = vi.spyOn(ipc, "gitBlameForMerge");
		useMergeStore.setState({ mergedPath: null });

		await useMergeStore.getState().fetchBlame();

		expect(spy).not.toHaveBeenCalled();
	});

	it("fetchBlame は成功時に blame データを設定する", async () => {
		const blameData = [
			{
				lineNumber: 1,
				hash: "abc1234",
				author: "User",
				date: "2024-01-01",
				summary: "init",
			},
		];
		vi.spyOn(ipc, "gitBlameForMerge").mockResolvedValue({
			ok: true,
			data: blameData,
		});
		useMergeStore.setState({ mergedPath: "/tmp/merged" });

		await useMergeStore.getState().fetchBlame();

		const state = useMergeStore.getState();
		expect(state.localBlame).toEqual(blameData);
		expect(state.remoteBlame).toEqual(blameData);
	});

	// --- reloadMergedFile エラーパス ---

	it("reloadMergedFile はファイル読み込み失敗時にエラーを設定する", async () => {
		vi.spyOn(ipc, "readFile").mockResolvedValue({
			ok: false,
			error: {
				code: "IoError",
				details: { message: "read failed" },
			} as AppError,
		});
		useMergeStore.setState({ mergedPath: "/tmp/merged" });

		await useMergeStore.getState().reloadMergedFile();

		expect(useMergeStore.getState().error?.details.message).toBe("read failed");
	});

	it("reloadMergedFile はコンフリクト解析失敗時にエラーを設定する", async () => {
		vi.spyOn(ipc, "readFile").mockResolvedValue({
			ok: true,
			data: {
				path: "/tmp/merged",
				content: "content",
				file_type: "merge",
			},
		});
		vi.spyOn(ipc, "parseConflicts").mockResolvedValue({
			ok: false,
			error: {
				code: "ParseError",
				details: { message: "parse error" },
			} as AppError,
		});
		useMergeStore.setState({ mergedPath: "/tmp/merged" });

		await useMergeStore.getState().reloadMergedFile();

		expect(useMergeStore.getState().error?.details.message).toBe("parse error");
	});

	// --- acceptLocal: エッジケース ---

	it("acceptLocal は mergedContent が null の場合に何もしない", () => {
		useMergeStore.setState({
			mergedContent: null,
			conflicts: [makeConflict(0, 1, "A", "B")],
		});

		useMergeStore.getState().acceptLocal(0);

		expect(useMergeStore.getState().mergedContent).toBeNull();
	});

	it("acceptLocal は解決済みコンフリクトを無視する", () => {
		const mergedContent = "before\nA\nafter";
		useMergeStore.setState({
			mergedContent,
			conflicts: [{ ...makeConflict(0, 1, "A", "B"), resolved: true }],
		});

		useMergeStore.getState().acceptLocal(0);

		expect(useMergeStore.getState().mergedContent).toBe(mergedContent);
	});

	it("acceptLocal は存在しないコンフリクト ID を無視する", () => {
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

		useMergeStore.getState().acceptLocal(999);

		expect(useMergeStore.getState().mergedContent).toBe(mergedContent);
	});

	// --- clearError ---

	it("clearError はエラーを null にリセットする", () => {
		useMergeStore.setState({
			error: {
				code: "Unknown",
				details: { message: "some error" },
			} as AppError,
		});

		useMergeStore.getState().clearError();

		expect(useMergeStore.getState().error).toBeNull();
	});

	// --- updateMergedContent ---

	it("updateMergedContent は内容を更新し isDirty を true にする", () => {
		useMergeStore.setState({ mergedContent: "old", isDirty: false });

		useMergeStore.getState().updateMergedContent("new");

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe("new");
		expect(state.isDirty).toBe(true);
	});
});
