import { describe, expect, it } from "vitest";
import type { ConflictRegion, ResolvedReplacement } from "../types/git";
import {
	buildConflictMarkerText,
	checkAllResolved,
	findReplacementStartLine,
	resolveConflictInContent,
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
