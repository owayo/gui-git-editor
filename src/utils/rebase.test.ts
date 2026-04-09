import { describe, expect, it } from "vitest";
import type { RebaseEntry } from "../types/git";
import {
	countSquashableEntries,
	findSquashTarget,
	hasSquashTargetBeforeEntry,
	squashAllEntries,
} from "./rebase";

function makeEntry(
	id: string,
	command: RebaseEntry["command"] = { type: "pick" },
): RebaseEntry {
	return {
		id,
		command,
		commit_hash: `abc${id}`,
		message: `commit ${id}`,
	};
}

describe("rebase utils", () => {
	describe("hasSquashTargetBeforeEntry", () => {
		it("先頭に特殊コマンドしかない場合は fixup 対象を認めない", () => {
			const entries = [
				makeEntry("exec", { type: "exec", value: "echo hi" }),
				makeEntry("1"),
			];

			expect(hasSquashTargetBeforeEntry(entries, "1")).toBe(false);
		});

		it("特殊コマンドを挟んでも直前までにコミット行があれば許可する", () => {
			const entries = [
				makeEntry("1"),
				makeEntry("exec", { type: "exec", value: "echo hi" }),
				makeEntry("2"),
			];

			expect(hasSquashTargetBeforeEntry(entries, "2")).toBe(true);
		});

		it("前方に squash/fixup しかない場合は統合先なしと判定する", () => {
			const entries = [
				makeEntry("1", { type: "squash" }),
				makeEntry("2", { type: "fixup" }),
				makeEntry("3"),
			];

			expect(hasSquashTargetBeforeEntry(entries, "3")).toBe(false);
		});

		it("squash/fixup の前に pick があれば統合先ありと判定する", () => {
			const entries = [
				makeEntry("1"),
				makeEntry("2", { type: "squash" }),
				makeEntry("3"),
			];

			expect(hasSquashTargetBeforeEntry(entries, "3")).toBe(true);
		});
	});

	describe("findSquashTarget", () => {
		it("特殊コマンドと fixup 連鎖を飛ばして統合元コミットを返す", () => {
			const entries = [
				makeEntry("1"),
				makeEntry("2", { type: "fixup" }),
				makeEntry("exec", { type: "exec", value: "echo hi" }),
				makeEntry("3", { type: "fixup" }),
			];

			expect(findSquashTarget(entries, 3)?.id).toBe("1");
		});
	});

	describe("countSquashableEntries", () => {
		it("コミット系エントリだけを数える", () => {
			const entries = [
				makeEntry("exec", { type: "exec", value: "echo hi" }),
				makeEntry("1"),
				makeEntry("drop", { type: "drop" }),
				makeEntry("2", { type: "reword" }),
			];

			expect(countSquashableEntries(entries)).toBe(2);
		});
	});

	describe("squashAllEntries", () => {
		it("特殊コマンドと drop を維持しつつ後続コミットだけを fixup にする", () => {
			const entries = [
				makeEntry("exec", { type: "exec", value: "echo hi" }),
				makeEntry("1"),
				makeEntry("drop", { type: "drop" }),
				makeEntry("label", { type: "label", value: "onto-main" }),
				makeEntry("2", { type: "reword" }),
				makeEntry("3", { type: "edit" }),
			];

			const squashed = squashAllEntries(entries);

			expect(squashed.map((entry) => entry.command)).toEqual([
				{ type: "exec", value: "echo hi" },
				{ type: "pick" },
				{ type: "drop" },
				{ type: "label", value: "onto-main" },
				{ type: "fixup" },
				{ type: "fixup" },
			]);
		});
	});
});
