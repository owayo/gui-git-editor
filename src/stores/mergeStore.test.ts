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
		vi.spyOn(ipc, "parseConflicts").mockResolvedValue({
			ok: true,
			data: {
				conflicts: [],
				hasConflicts: false,
				totalConflicts: 0,
			},
		});
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

	it("revert は LOCAL が空のコンフリクトを余計な空行なしで復元する", () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"=======",
			"remote",
			">>>>>>> REMOTE",
			"after",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "", "remote")],
		});

		useMergeStore.getState().acceptLocal(0);
		expect(useMergeStore.getState().mergedContent).toBe(
			["before", "after"].join("\n"),
		);

		useMergeStore.getState().revertConflict(0);

		expect(useMergeStore.getState().mergedContent).toBe(mergedContent);
	});

	it("revert はファイル全体が空文字に解決されたコンフリクトも復元する", () => {
		const mergedContent = [
			"<<<<<<< LOCAL",
			"=======",
			"remote",
			">>>>>>> REMOTE",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 0, "", "remote")],
		});

		useMergeStore.getState().acceptLocal(0);
		expect(useMergeStore.getState().mergedContent).toBe("");

		useMergeStore.getState().revertConflict(0);

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe(mergedContent);
		expect(state.conflicts[0].resolved).toBe(false);
	});

	it("revert は REMOTE が空のコンフリクトを余計な空行なしで復元する", () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"local",
			"=======",
			">>>>>>> REMOTE",
			"after",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "local", "")],
		});

		useMergeStore.getState().acceptRemote(0);
		expect(useMergeStore.getState().mergedContent).toBe(
			["before", "after"].join("\n"),
		);

		useMergeStore.getState().revertConflict(0);

		expect(useMergeStore.getState().mergedContent).toBe(mergedContent);
	});

	it("revert は BASE が空の diff3 コンフリクトを余計な空行なしで復元する", () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"local",
			"||||||| BASE",
			"=======",
			"remote",
			">>>>>>> REMOTE",
			"after",
		].join("\n");

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "local", "remote", "")],
		});

		useMergeStore.getState().acceptLocal(0);
		expect(useMergeStore.getState().mergedContent).toBe(
			["before", "local", "after"].join("\n"),
		);

		useMergeStore.getState().revertConflict(0);

		expect(useMergeStore.getState().mergedContent).toBe(mergedContent);
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

	// --- acceptRemote 系 ---

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

	// --- acceptBoth 系 ---

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

	// --- goToNextConflict 系 ---

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

	// --- goToPrevConflict 系 ---

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

	// --- すべて解決済みの navigation ---

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

	// --- save 系 ---

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

	it("save は保存中に updateMergedContent が呼ばれた場合 isDirty を再計算する", async () => {
		// writeFile の解決を手動制御し、await 中に MERGED パネルへ追加入力された状況を再現する
		let resolveWrite: () => void = () => {};
		vi.spyOn(ipc, "writeFile").mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveWrite = () => resolve({ ok: true, data: undefined as never });
				}),
		);

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			mergedContent: "saved content",
			isDirty: true,
		});

		// 保存途中で MERGED パネルに追加入力が入ったケース
		const savePromise = useMergeStore.getState().save();
		useMergeStore.getState().updateMergedContent("saved content + edit");

		resolveWrite();
		const ok = await savePromise;

		expect(ok).toBe(true);
		const state = useMergeStore.getState();
		// 書き込んだ内容と最新の mergedContent が食い違うため isDirty は true のまま維持される
		expect(state.mergedContent).toBe("saved content + edit");
		expect(state.isDirty).toBe(true);
		expect(state.isSaving).toBe(false);
	});

	it("save は保存中に updateMergedContent で保存対象と同じ内容へ戻された場合 isDirty を false にする", async () => {
		let resolveWrite: () => void = () => {};
		vi.spyOn(ipc, "writeFile").mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveWrite = () => resolve({ ok: true, data: undefined as never });
				}),
		);

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			mergedContent: "saved content",
			isDirty: true,
		});

		const savePromise = useMergeStore.getState().save();
		// 一旦別内容に編集してから保存対象と同じ内容へ戻す
		useMergeStore.getState().updateMergedContent("temp edit");
		useMergeStore.getState().updateMergedContent("saved content");

		resolveWrite();
		await savePromise;

		const state = useMergeStore.getState();
		// ディスク内容と一致するため未保存差分は無く isDirty は false になる
		expect(state.mergedContent).toBe("saved content");
		expect(state.isDirty).toBe(false);
	});

	it("reload 時に解決済みコンフリクトが再出現した場合は古い resolved 状態を保持しない", async () => {
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

	// --- initMerge 系 ---

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

	it("initMerge は開始時に古い blame をクリアする", async () => {
		const oldBlame = [
			{
				lineNumber: 1,
				hash: "old",
				author: "U",
				date: "d",
				summary: "old",
			},
		];
		useMergeStore.setState({ localBlame: oldBlame, remoteBlame: oldBlame });

		let capturedBlame: {
			local: unknown;
			remote: unknown;
		} | null = null;
		vi.spyOn(ipc, "readMergeFiles").mockImplementation(async () => {
			const state = useMergeStore.getState();
			capturedBlame = {
				local: state.localBlame,
				remote: state.remoteBlame,
			};
			return {
				ok: false,
				error: { code: "Unknown", details: { message: "stop" } } as AppError,
			};
		});

		await useMergeStore.getState().initMerge("/l", "/r", null, "/m");

		expect(capturedBlame).not.toBeNull();
		expect(capturedBlame).toEqual({ local: null, remote: null });
	});

	// --- checkCodexAvailable 系 ---

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

	// --- openCodexResolve 系 ---

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

	// --- fetchBlame 系 ---

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

	it("fetchBlame は古い応答で新しい結果を上書きしない", async () => {
		const oldBlame = [
			{
				lineNumber: 1,
				hash: "old",
				author: "U",
				date: "d",
				summary: "old",
			},
		];
		const newBlame = [
			{
				lineNumber: 1,
				hash: "new",
				author: "U",
				date: "d",
				summary: "new",
			},
		];
		let resolveFirst: (() => void) | null = null;
		const spy = vi.spyOn(ipc, "gitBlameForMerge");
		// 1 回目: 解決を遅延させる
		spy.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveFirst = () => resolve({ ok: true, data: oldBlame });
				}),
		);
		spy.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveFirst?.();
					resolve({ ok: true, data: oldBlame });
				}),
		);
		// 2 回目以降: 新しい blame を返す
		spy.mockResolvedValue({ ok: true, data: newBlame });

		useMergeStore.setState({ mergedPath: "/tmp/merged" });
		const firstPromise = useMergeStore.getState().fetchBlame();

		// 1 回目の応答が返る前に 2 回目を実行・完了させる
		await useMergeStore.getState().fetchBlame();
		expect(useMergeStore.getState().localBlame).toEqual(newBlame);

		// 古い 1 回目の応答を完了させても上書きされない
		await firstPromise;
		expect(useMergeStore.getState().localBlame).toEqual(newBlame);
	});

	it("fetchBlame は応答中に mergedPath が変わった場合、古い応答で上書きしない", async () => {
		const oldBlame = [
			{
				lineNumber: 1,
				hash: "old",
				author: "U",
				date: "d",
				summary: "old",
			},
		];
		vi.spyOn(ipc, "gitBlameForMerge").mockImplementation(
			() =>
				new Promise((resolve) => {
					// 応答前に mergedPath を別のファイルに切り替える
					queueMicrotask(() => {
						useMergeStore.setState({ mergedPath: "/tmp/other" });
						resolve({ ok: true, data: oldBlame });
					});
				}),
		);
		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			localBlame: null,
			remoteBlame: null,
		});

		await useMergeStore.getState().fetchBlame();

		const state = useMergeStore.getState();
		expect(state.localBlame).toBeNull();
		expect(state.remoteBlame).toBeNull();
	});

	// --- reloadMergedFile のエラーパス ---

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

	it("reloadMergedFile は再読み込み中の MERGED 手動編集をディスク内容で握りつぶさない", async () => {
		const diskContent = [
			"disk",
			"<<<<<<< LOCAL",
			"X",
			"=======",
			"Y",
			">>>>>>> REMOTE",
		].join("\n");
		const userInput = "ユーザーが入力した内容";

		// readFile を解決前で止め、await 中に手動編集を割り込ませる。
		let resolveReadFile: (
			value: Awaited<ReturnType<typeof ipc.readFile>>,
		) => void = () => {};
		vi.spyOn(ipc, "readFile").mockReturnValue(
			new Promise((resolve) => {
				resolveReadFile = resolve;
			}),
		);
		// reload 側（diskContent）はコンフリクトあり、手動編集側（userInput）は解決済みを返す。
		vi.spyOn(ipc, "parseConflicts").mockImplementation(async (content) => ({
			ok: true,
			data: {
				conflicts:
					content === diskContent ? [makeConflict(0, 1, "X", "Y")] : [],
				hasConflicts: content === diskContent,
				totalConflicts: content === diskContent ? 1 : 0,
			},
		}));

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			mergedContent: "original",
			conflicts: [makeConflict(0, 0, "A", "B")],
		});

		// reload 開始（readFile の await で待機）。
		const reloadPromise = useMergeStore.getState().reloadMergedFile();
		// await 中にユーザーが MERGED パネルを手動編集する。
		useMergeStore.getState().updateMergedContent(userInput);

		// readFile を解決して reload を続行させる。
		resolveReadFile({
			ok: true,
			data: { path: "/tmp/merged", content: diskContent, file_type: "merge" },
		});
		await reloadPromise;
		// updateMergedContent 内の非同期 parse も flush する。
		await new Promise((resolve) => setTimeout(resolve, 0));

		const state = useMergeStore.getState();
		// ディスク内容で上書きされず、ユーザー入力と未保存状態が維持される。
		expect(state.mergedContent).toBe(userInput);
		expect(state.isDirty).toBe(true);
	});

	it("reloadMergedFile は手動編集で supersede された後の読込失敗で古いエラーを表示しない", async () => {
		const userInput = "ユーザーが入力した内容";

		// readFile を解決前で止め、await 中に手動編集を割り込ませる。
		let resolveReadFile: (
			value: Awaited<ReturnType<typeof ipc.readFile>>,
		) => void = () => {};
		vi.spyOn(ipc, "readFile").mockReturnValue(
			new Promise((resolve) => {
				resolveReadFile = resolve;
			}),
		);

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			mergedContent: "original",
			conflicts: [makeConflict(0, 0, "A", "B")],
		});

		const reloadPromise = useMergeStore.getState().reloadMergedFile();
		// await 中にユーザーが手動編集し、reload を supersede する。
		useMergeStore.getState().updateMergedContent(userInput);

		// 読込を失敗で解決する。stale な reload なのでエラーを出してはならない。
		resolveReadFile({
			ok: false,
			error: {
				code: "IoError",
				details: { message: "read failed" },
			} as AppError,
		});
		await reloadPromise;
		await new Promise((resolve) => setTimeout(resolve, 0));

		const state = useMergeStore.getState();
		// 古い読込エラーを表示せず、ユーザー入力と未保存状態を保持する。
		expect(state.error).toBeNull();
		expect(state.mergedContent).toBe(userInput);
		expect(state.isDirty).toBe(true);
	});

	it("reloadMergedFile は手動編集で supersede された後の解析失敗で古いエラーを表示しない", async () => {
		const diskContent = [
			"disk",
			"<<<<<<< LOCAL",
			"X",
			"=======",
			"Y",
			">>>>>>> REMOTE",
		].join("\n");
		const userInput = "ユーザーが入力した内容";

		vi.spyOn(ipc, "readFile").mockResolvedValue({
			ok: true,
			data: { path: "/tmp/merged", content: diskContent, file_type: "merge" },
		});

		let resolveReloadParse: (
			value: Awaited<ReturnType<typeof ipc.parseConflicts>>,
		) => void = () => {};
		vi.spyOn(ipc, "parseConflicts").mockImplementation(async (content) => {
			if (content === diskContent) {
				return new Promise((resolve) => {
					resolveReloadParse = resolve;
				});
			}

			return {
				ok: true,
				data: { conflicts: [], hasConflicts: false, totalConflicts: 0 },
			};
		});

		useMergeStore.setState({
			mergedPath: "/tmp/merged",
			mergedContent: "original",
			conflicts: [makeConflict(0, 0, "A", "B")],
		});

		const reloadPromise = useMergeStore.getState().reloadMergedFile();
		// reload 側が readFile 後の parseConflicts await に入るまで進める。
		await new Promise((resolve) => setTimeout(resolve, 0));

		// 解析待機中に手動編集が入り、reload を supersede する。
		useMergeStore.getState().updateMergedContent(userInput);

		// stale な reload 側の解析失敗は UI エラーに反映してはならない。
		resolveReloadParse({
			ok: false,
			error: {
				code: "ParseError",
				details: { message: "parse failed" },
			} as AppError,
		});
		await reloadPromise;
		await new Promise((resolve) => setTimeout(resolve, 0));

		const state = useMergeStore.getState();
		expect(state.error).toBeNull();
		expect(state.mergedContent).toBe(userInput);
		expect(state.isDirty).toBe(true);
	});

	// --- acceptLocal のエッジケース ---

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

	// --- clearError 系 ---

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

	// --- updateMergedContent 系 ---

	it("updateMergedContent は内容を更新し isDirty を true にする", async () => {
		useMergeStore.setState({ mergedContent: "old", isDirty: false });

		useMergeStore.getState().updateMergedContent("new");
		await Promise.resolve();

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe("new");
		expect(state.isDirty).toBe(true);
	});

	it("手動編集で先頭に行を追加した後も acceptLocal は最新位置のコンフリクトを解決する", async () => {
		const mergedContent = [
			"before",
			"<<<<<<< LOCAL",
			"A",
			"=======",
			"B",
			">>>>>>> REMOTE",
			"after",
		].join("\n");
		const editedContent = ["header", mergedContent].join("\n");

		vi.spyOn(ipc, "parseConflicts").mockResolvedValue({
			ok: true,
			data: {
				conflicts: [makeConflict(0, 2, "A", "B")],
				hasConflicts: true,
				totalConflicts: 1,
			},
		});

		useMergeStore.setState({
			mergedContent,
			conflicts: [makeConflict(0, 1, "A", "B")],
		});

		useMergeStore.getState().updateMergedContent(editedContent);
		await Promise.resolve();

		expect(useMergeStore.getState().conflicts[0].startLine).toBe(2);

		useMergeStore.getState().acceptLocal(0);

		const state = useMergeStore.getState();
		expect(state.mergedContent).toBe(
			["header", "before", "A", "after"].join("\n"),
		);
		expect(state.conflicts[0].resolved).toBe(true);
	});

	// --- revert 時の後続コンフリクト位置シフト ---

	it("revert は後続コンフリクトの行位置をマーカー行数分シフトする", () => {
		// 2つのコンフリクトがあるファイル
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

		// 最初のコンフリクトを解決
		useMergeStore.getState().acceptLocal(0);
		// 解決後: ["before", "A", "mid", "<<<<<<< LOCAL", "X", "=======", "Y", ">>>>>>> REMOTE", "after"]
		const afterResolve = useMergeStore.getState();
		expect(afterResolve.conflicts[1].startLine).toBe(3);

		// 最初のコンフリクトを revert
		useMergeStore.getState().revertConflict(0);

		const state = useMergeStore.getState();
		// revert 後は元のマーカーが復元されるため、後続コンフリクトの位置が戻る
		expect(state.conflicts[0].resolved).toBe(false);
		expect(state.conflicts[0].startLine).toBe(1);
		expect(state.conflicts[1].startLine).toBe(7);
		expect(state.mergedContent).toBe(mergedContent);
	});

	it("revert は後続の resolvedReplacements の startLine もシフトする", () => {
		// 2つのコンフリクトがあるファイル
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

		// 両方のコンフリクトを解決
		useMergeStore.getState().acceptLocal(0);
		useMergeStore.getState().acceptRemote(1);

		// 両方が解決済み
		const afterBothResolved = useMergeStore.getState();
		expect(afterBothResolved.allResolved).toBe(true);

		// 最初のコンフリクトを revert → 後続の replacement の startLine がシフトする
		useMergeStore.getState().revertConflict(0);

		const state = useMergeStore.getState();
		expect(state.conflicts[0].resolved).toBe(false);
		expect(state.conflicts[1].resolved).toBe(true);
		// revert したコンフリクトの replacement は削除される
		expect(state.resolvedReplacements[0]).toBeUndefined();
		// 後続の replacement は存在し、行位置がシフトしている
		expect(state.resolvedReplacements[1]).toBeDefined();
		expect(state.allResolved).toBe(false);
	});
});
