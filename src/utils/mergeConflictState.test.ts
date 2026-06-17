import { describe, expect, it } from "vitest";
import type { ConflictRegion, ResolvedReplacement } from "../types/git";
import {
	buildConflictMarkerText,
	buildConflictState,
	checkAllResolved,
	findReplacementStartLine,
	markResolvedAndShiftConflicts,
	markRevertedAndShiftConflicts,
	preserveResolvedConflictsAfterEdit,
	reconcileConflictsOnReload,
	resolveConflictInContent,
	updateResolvedReplacementsAfterResolve,
	updateResolvedReplacementsAfterRevert,
} from "./mergeConflictState";

/** テスト用に必要なフィールドだけ指定して ConflictRegion を組み立てる。 */
function makeConflict(overrides: Partial<ConflictRegion>): ConflictRegion {
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
		localContent: "",
		baseContent: null,
		remoteContent: "",
		resolved: false,
		...overrides,
	};
}

function replacement(
	text: string,
	startLine: number,
	lineCount: number,
): ResolvedReplacement {
	return { text, startLine, lineCount };
}

describe("findReplacementStartLine", () => {
	it("lineCount が 0 のとき、startLine が範囲内ならそのまま返す", () => {
		// 0 行置換（空文字解決）は内容照合できないため、範囲チェックのみ行う。
		expect(findReplacementStartLine(["a", "b"], replacement("", 1, 0))).toBe(1);
	});

	it("lineCount が 0 で startLine が末尾境界（length）でも有効", () => {
		expect(findReplacementStartLine(["a", "b"], replacement("", 2, 0))).toBe(2);
	});

	it("lineCount が 0 で startLine が範囲外なら null", () => {
		expect(
			findReplacementStartLine(["a", "b"], replacement("", 3, 0)),
		).toBeNull();
		expect(
			findReplacementStartLine(["a", "b"], replacement("", -1, 0)),
		).toBeNull();
	});

	it("アンカー位置で完全一致するならそのまま返す", () => {
		const lines = ["x", "FOO", "BAR", "y"];
		expect(findReplacementStartLine(lines, replacement("FOO\nBAR", 1, 2))).toBe(
			1,
		);
	});

	it("アンカーがずれていても最も近い完全一致へフォールバックする", () => {
		const lines = ["pre", "pre", "FOO", "BAR", "y"];
		// アンカー 0 は不一致。実体は行 2 にある。
		expect(findReplacementStartLine(lines, replacement("FOO\nBAR", 0, 2))).toBe(
			2,
		);
	});

	it("複数の一致候補があるとき、アンカーに最も近いものを選ぶ", () => {
		const lines = ["FOO", "BAR", "mid", "FOO", "BAR"];
		// 候補は行 0 と行 3。アンカー 2 に近いのは行 3。
		expect(findReplacementStartLine(lines, replacement("FOO\nBAR", 2, 2))).toBe(
			3,
		);
		// アンカー 1 に近いのは行 0。
		expect(findReplacementStartLine(lines, replacement("FOO\nBAR", 1, 2))).toBe(
			0,
		);
	});

	it("距離が同じ候補が複数あるときは添字の小さい方を選ぶ", () => {
		const lines = ["FOO", "mid", "FOO", "x"];
		// 候補は行 0 と行 2。アンカー 1 から等距離なので添字の小さい 0。
		expect(findReplacementStartLine(lines, replacement("FOO", 1, 1))).toBe(0);
	});

	it("どこにも一致しなければ null を返す", () => {
		const lines = ["a", "b", "c"];
		expect(
			findReplacementStartLine(lines, replacement("FOO\nBAR", 0, 2)),
		).toBeNull();
	});
});

describe("resolveConflictInContent", () => {
	const content = [
		"a",
		"<<<<<<< LOCAL",
		"L",
		"=======",
		"R",
		">>>>>>> REMOTE",
		"b",
	].join("\n");
	const conflict = makeConflict({ startLine: 1, endLine: 5 });

	it("コンフリクトブロックを置換テキストで差し替える", () => {
		expect(resolveConflictInContent(content, conflict, "X")).toBe(
			["a", "X", "b"].join("\n"),
		);
	});

	it("空文字置換は 0 行として扱い、余計な空行を残さない", () => {
		expect(resolveConflictInContent(content, conflict, "")).toBe(
			["a", "b"].join("\n"),
		);
	});

	it("複数行の置換テキストを展開する", () => {
		expect(resolveConflictInContent(content, conflict, "X\nY")).toBe(
			["a", "X", "Y", "b"].join("\n"),
		);
	});
});

describe("buildConflictMarkerText", () => {
	it("標準的なコンフリクトのマーカーを再構築する", () => {
		const conflict = makeConflict({ localContent: "L", remoteContent: "R" });
		expect(buildConflictMarkerText(conflict)).toBe(
			["<<<<<<< LOCAL", "L", "=======", "R", ">>>>>>> REMOTE"].join("\n"),
		);
	});

	it("片側が空のセクションには内容行を挿入しない", () => {
		const conflict = makeConflict({ localContent: "", remoteContent: "R" });
		expect(buildConflictMarkerText(conflict)).toBe(
			["<<<<<<< LOCAL", "=======", "R", ">>>>>>> REMOTE"].join("\n"),
		);
	});

	it("diff3 形式（BASE あり）では ||||||| BASE セクションを含める", () => {
		const conflict = makeConflict({
			localContent: "L",
			baseContent: "B",
			remoteContent: "R",
		});
		expect(buildConflictMarkerText(conflict)).toBe(
			[
				"<<<<<<< LOCAL",
				"L",
				"||||||| BASE",
				"B",
				"=======",
				"R",
				">>>>>>> REMOTE",
			].join("\n"),
		);
	});

	it("BASE が空文字（diff3）でもマーカー行は出すが内容行は挿入しない", () => {
		const conflict = makeConflict({
			localContent: "L",
			baseContent: "",
			remoteContent: "R",
		});
		expect(buildConflictMarkerText(conflict)).toBe(
			[
				"<<<<<<< LOCAL",
				"L",
				"||||||| BASE",
				"=======",
				"R",
				">>>>>>> REMOTE",
			].join("\n"),
		);
	});
});

describe("checkAllResolved", () => {
	it("空配列のときは false（解決すべきコンフリクトが無い）", () => {
		expect(checkAllResolved([])).toBe(false);
	});

	it("全て解決済みなら true", () => {
		expect(
			checkAllResolved([
				makeConflict({ id: 0, resolved: true }),
				makeConflict({ id: 1, resolved: true }),
			]),
		).toBe(true);
	});

	it("1 つでも未解決なら false", () => {
		expect(
			checkAllResolved([
				makeConflict({ id: 0, resolved: true }),
				makeConflict({ id: 1, resolved: false }),
			]),
		).toBe(false);
	});
});

describe("markResolvedAndShiftConflicts", () => {
	it("対象 ID が見つからないとき null を返す", () => {
		const conflicts = [makeConflict({ id: 1, startLine: 0, endLine: 2 })];
		expect(markResolvedAndShiftConflicts(conflicts, 99, "X")).toBeNull();
	});

	it("解決対象を resolved=true に変え、置換行数で endLine を更新する", () => {
		const conflicts = [makeConflict({ id: 1, startLine: 5, endLine: 9 })];
		const updated = markResolvedAndShiftConflicts(conflicts, 1, "X\nY");
		expect(updated).not.toBeNull();
		const [target] = updated as ConflictRegion[];
		expect(target.resolved).toBe(true);
		expect(target.startLine).toBe(5);
		// 2 行置換なので、endLine = startLine + 2 - 1 = 6
		expect(target.endLine).toBe(6);
	});

	it("空文字置換のとき endLine は startLine と同値（0 行置換扱い）", () => {
		const conflicts = [makeConflict({ id: 1, startLine: 5, endLine: 9 })];
		const updated = markResolvedAndShiftConflicts(conflicts, 1, "");
		const [target] = updated as ConflictRegion[];
		expect(target.resolved).toBe(true);
		expect(target.startLine).toBe(5);
		expect(target.endLine).toBe(5);
	});

	it("解決対象より後ろのコンフリクトは行番号を平行移動する", () => {
		// target: 5..9 (5 行) を "X" (1 行) で置換 → delta = -4
		const conflicts = [
			makeConflict({ id: 1, startLine: 5, endLine: 9 }),
			makeConflict({
				id: 2,
				startLine: 20,
				localStartLine: 21,
				localEndLine: 22,
				remoteStartLine: 23,
				remoteEndLine: 24,
				endLine: 25,
			}),
		];
		const updated = markResolvedAndShiftConflicts(conflicts, 1, "X");
		const [, after] = updated as ConflictRegion[];
		expect(after.startLine).toBe(16);
		expect(after.localStartLine).toBe(17);
		expect(after.localEndLine).toBe(18);
		expect(after.remoteStartLine).toBe(19);
		expect(after.remoteEndLine).toBe(20);
		expect(after.endLine).toBe(21);
	});

	it("解決対象より前のコンフリクトはシフトしない", () => {
		const conflicts = [
			makeConflict({ id: 0, startLine: 0, endLine: 4 }),
			makeConflict({ id: 1, startLine: 10, endLine: 14 }),
		];
		const updated = markResolvedAndShiftConflicts(conflicts, 1, "X");
		const [before] = updated as ConflictRegion[];
		expect(before.startLine).toBe(0);
		expect(before.endLine).toBe(4);
	});

	it("diff3 BASE があるコンフリクトでも base*Line を平行移動する", () => {
		// 解決対象は base なし、後続が diff3。delta = -4。
		const conflicts = [
			makeConflict({ id: 1, startLine: 5, endLine: 9 }),
			makeConflict({
				id: 2,
				startLine: 20,
				baseStartLine: 22,
				baseEndLine: 23,
				localStartLine: 21,
				localEndLine: 22,
				remoteStartLine: 24,
				remoteEndLine: 25,
				endLine: 26,
			}),
		];
		const updated = markResolvedAndShiftConflicts(conflicts, 1, "X");
		const [, after] = updated as ConflictRegion[];
		expect(after.baseStartLine).toBe(18);
		expect(after.baseEndLine).toBe(19);
	});
});

describe("updateResolvedReplacementsAfterResolve", () => {
	it("解決対象の置換メタデータを新規に追加する", () => {
		const updated = updateResolvedReplacementsAfterResolve(
			{},
			3,
			makeConflict({ id: 3, startLine: 5, endLine: 9 }),
			"X\nY",
		);
		expect(updated[3]).toEqual({ text: "X\nY", startLine: 5, lineCount: 2 });
	});

	it("解決対象より後ろの置換アンカーは delta 分シフトする", () => {
		// 解決対象 1: startLine=5, endLine=9 (5 行) を "X" (1 行) → delta = -4
		const existing: Record<number, ResolvedReplacement> = {
			2: { text: "Y", startLine: 30, lineCount: 1 },
		};
		const updated = updateResolvedReplacementsAfterResolve(
			existing,
			1,
			makeConflict({ id: 1, startLine: 5, endLine: 9 }),
			"X",
		);
		expect(updated[2]).toEqual({ text: "Y", startLine: 26, lineCount: 1 });
	});

	it("解決対象より前の置換アンカーはそのまま保持する", () => {
		const existing: Record<number, ResolvedReplacement> = {
			0: { text: "Pre", startLine: 0, lineCount: 1 },
		};
		const updated = updateResolvedReplacementsAfterResolve(
			existing,
			1,
			makeConflict({ id: 1, startLine: 10, endLine: 14 }),
			"X",
		);
		expect(updated[0]).toEqual({ text: "Pre", startLine: 0, lineCount: 1 });
	});

	it("空文字置換でも lineCount=0 のメタデータを残す", () => {
		const updated = updateResolvedReplacementsAfterResolve(
			{},
			1,
			makeConflict({ id: 1, startLine: 5, endLine: 9 }),
			"",
		);
		expect(updated[1]).toEqual({ text: "", startLine: 5, lineCount: 0 });
	});
});

describe("markRevertedAndShiftConflicts", () => {
	it("対象コンフリクトを未解決に戻し、マーカー行数に基づき後続をシフトする", () => {
		// 解決済み: startLine=5, lineCount=1 → revert 後マーカーは 5 行
		// delta = 5 - 1 = 4
		const target = makeConflict({
			id: 1,
			startLine: 5,
			endLine: 5,
			resolved: true,
			localContent: "L",
			remoteContent: "R",
		});
		const conflicts = [
			target,
			makeConflict({
				id: 2,
				startLine: 20,
				localStartLine: 21,
				localEndLine: 22,
				remoteStartLine: 23,
				remoteEndLine: 24,
				endLine: 25,
			}),
		];
		const replacement: ResolvedReplacement = {
			text: "X",
			startLine: 5,
			lineCount: 1,
		};
		// マーカー行数 = 5: <<<, L, ===, R, >>>
		const updated = markRevertedAndShiftConflicts(
			conflicts,
			target,
			replacement,
			5,
		);
		const [reverted, after] = updated;
		expect(reverted.resolved).toBe(false);
		expect(reverted.startLine).toBe(5);
		expect(after.startLine).toBe(24); // 20 + 4
		expect(after.endLine).toBe(29); // 25 + 4
	});

	it("revert 対象より前のコンフリクトはシフトしない", () => {
		const target = makeConflict({
			id: 1,
			startLine: 10,
			endLine: 10,
			resolved: true,
			localContent: "L",
			remoteContent: "R",
		});
		const conflicts = [
			makeConflict({ id: 0, startLine: 0, endLine: 4 }),
			target,
		];
		const replacement: ResolvedReplacement = {
			text: "X",
			startLine: 10,
			lineCount: 1,
		};
		const updated = markRevertedAndShiftConflicts(
			conflicts,
			target,
			replacement,
			5,
		);
		const [before] = updated;
		expect(before.startLine).toBe(0);
		expect(before.endLine).toBe(4);
	});
});

describe("updateResolvedReplacementsAfterRevert", () => {
	it("revert 対象の置換メタデータを削除する", () => {
		const existing: Record<number, ResolvedReplacement> = {
			1: { text: "A", startLine: 5, lineCount: 1 },
			2: { text: "B", startLine: 20, lineCount: 1 },
		};
		const updated = updateResolvedReplacementsAfterRevert(
			existing,
			1,
			{ text: "A", startLine: 5, lineCount: 1 },
			5,
		);
		expect(updated[1]).toBeUndefined();
	});

	it("revert 対象より後ろの置換アンカーは delta 分シフトする", () => {
		// 置換 1: startLine=5, lineCount=1 → マーカー 5 行で revert → delta=4
		const existing: Record<number, ResolvedReplacement> = {
			2: { text: "B", startLine: 20, lineCount: 1 },
		};
		const updated = updateResolvedReplacementsAfterRevert(
			existing,
			1,
			{ text: "A", startLine: 5, lineCount: 1 },
			5,
		);
		expect(updated[2]).toEqual({ text: "B", startLine: 24, lineCount: 1 });
	});
});

describe("reconcileConflictsOnReload", () => {
	it("前回未解決で今回見つからないものは外部解決済みとして扱う", () => {
		const old = [
			makeConflict({
				id: 0,
				localContent: "L1",
				remoteContent: "R1",
				resolved: false,
			}),
		];
		const newUnresolved: ConflictRegion[] = [];
		const result = reconcileConflictsOnReload(old, newUnresolved);
		expect(result.externallyResolved).toHaveLength(1);
		expect(result.externallyResolved[0].resolved).toBe(true);
		expect(result.preservedResolved).toHaveLength(0);
	});

	it("前回未解決で今回も同じ内容で未解決なら externallyResolved に入れない", () => {
		const old = [
			makeConflict({
				id: 0,
				localContent: "L1",
				remoteContent: "R1",
				resolved: false,
			}),
		];
		const newUnresolved = [
			makeConflict({
				id: 99,
				localContent: "L1",
				remoteContent: "R1",
				resolved: false,
			}),
		];
		const result = reconcileConflictsOnReload(old, newUnresolved);
		expect(result.externallyResolved).toHaveLength(0);
	});

	it("前回解決済みでも今回未解決として再出現したものは preservedResolved に入れない", () => {
		const old = [
			makeConflict({
				id: 0,
				localContent: "L1",
				remoteContent: "R1",
				resolved: true,
			}),
		];
		const newUnresolved = [
			makeConflict({
				id: 99,
				localContent: "L1",
				remoteContent: "R1",
				resolved: false,
			}),
		];
		const result = reconcileConflictsOnReload(old, newUnresolved);
		expect(result.preservedResolved).toHaveLength(0);
	});

	it("前回解決済みで今回出現しないものは preservedResolved として保持する", () => {
		const old = [
			makeConflict({
				id: 0,
				localContent: "L1",
				remoteContent: "R1",
				resolved: true,
			}),
		];
		const newUnresolved: ConflictRegion[] = [];
		const result = reconcileConflictsOnReload(old, newUnresolved);
		expect(result.preservedResolved).toHaveLength(1);
		expect(result.preservedResolved[0].id).toBe(0);
	});
});

describe("preserveResolvedConflictsAfterEdit", () => {
	it("未解決として再出現していない解決済みコンフリクトだけを残す", () => {
		const old = [
			makeConflict({
				id: 0,
				localContent: "L1",
				remoteContent: "R1",
				resolved: true,
			}),
			makeConflict({
				id: 1,
				localContent: "L2",
				remoteContent: "R2",
				resolved: true,
			}),
		];
		const newUnresolved = [
			makeConflict({
				id: 99,
				localContent: "L2",
				remoteContent: "R2",
				resolved: false,
			}),
		];
		const result = preserveResolvedConflictsAfterEdit(old, newUnresolved);
		// id=1 は再出現したので保持しない、id=0 のみ保持される
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(0);
	});

	it("未解決のままだったコンフリクトは preservedResolved に入らない", () => {
		const old = [
			makeConflict({
				id: 0,
				localContent: "L1",
				remoteContent: "R1",
				resolved: false,
			}),
		];
		const newUnresolved = [
			makeConflict({
				id: 0,
				localContent: "L1",
				remoteContent: "R1",
				resolved: false,
			}),
		];
		const result = preserveResolvedConflictsAfterEdit(old, newUnresolved);
		expect(result).toHaveLength(0);
	});
});

describe("buildConflictState", () => {
	it("未解決と保持解決済みを ID 衝突なく結合する", () => {
		const newUnresolved = [
			makeConflict({ id: 0, localContent: "L1", remoteContent: "R1" }),
		];
		const preserved = [
			makeConflict({
				id: 0,
				localContent: "Lkept",
				remoteContent: "Rkept",
				resolved: true,
			}),
		];
		const result = buildConflictState(newUnresolved, preserved, {}, 0, "");
		// 同じ id=0 が両方にあるので、未解決側は別 ID に振り直される
		const ids = result.conflicts.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length); // 重複なし
		expect(result.conflicts).toHaveLength(2);
	});

	it("未解決がゼロなら allResolved=true", () => {
		const result = buildConflictState(
			[],
			[
				makeConflict({
					id: 0,
					localContent: "L",
					remoteContent: "R",
					resolved: true,
				}),
			],
			{},
			0,
			"",
		);
		expect(result.allResolved).toBe(true);
	});

	it("未解決がある場合は allResolved=false", () => {
		const result = buildConflictState([makeConflict({ id: 0 })], [], {}, 0, "");
		expect(result.allResolved).toBe(false);
	});

	it("保持解決済みでない置換メタデータは破棄する", () => {
		const replacements: Record<number, ResolvedReplacement> = {
			5: { text: "kept", startLine: 0, lineCount: 1 },
			6: { text: "drop", startLine: 0, lineCount: 1 },
		};
		const preserved = [
			makeConflict({
				id: 5,
				localContent: "L",
				remoteContent: "R",
				resolved: true,
			}),
		];
		const result = buildConflictState([], preserved, replacements, 0, "kept");
		expect(result.resolvedReplacements[5]).toBeDefined();
		expect(result.resolvedReplacements[6]).toBeUndefined();
	});
});
