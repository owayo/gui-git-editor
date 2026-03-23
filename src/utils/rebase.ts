import type { RebaseEntry } from "../types/git";

const SQUASHABLE_COMMAND_TYPES = [
	"pick",
	"reword",
	"edit",
	"squash",
	"fixup",
] as const;
const SQUASH_TARGET_COMMAND_TYPES = ["pick", "reword", "edit"] as const;

type SquashableCommandType = (typeof SQUASHABLE_COMMAND_TYPES)[number];
type SquashTargetCommandType = (typeof SQUASH_TARGET_COMMAND_TYPES)[number];

function isSquashableCommandType(
	commandType: RebaseEntry["command"]["type"],
): commandType is SquashableCommandType {
	return (SQUASHABLE_COMMAND_TYPES as readonly string[]).includes(commandType);
}

function isSquashTargetCommandType(
	commandType: RebaseEntry["command"]["type"],
): commandType is SquashTargetCommandType {
	return (SQUASH_TARGET_COMMAND_TYPES as readonly string[]).includes(
		commandType,
	);
}

/**
 * fixup / squash の統合先になれるのは、実際にコミットを適用する行だけ。
 * exec や label などの特殊コマンドは統合先として扱わない。
 */
export function isSquashableEntry(
	entry: Pick<RebaseEntry, "command">,
): boolean {
	return isSquashableCommandType(entry.command.type);
}

/**
 * 指定位置より前に、fixup / squash の統合先になれるコミット行があるかを返す。
 */
export function hasSquashTargetBeforeIndex(
	entries: Pick<RebaseEntry, "command">[],
	index: number,
): boolean {
	if (index <= 0) return false;

	for (let i = 0; i < index; i++) {
		if (isSquashableEntry(entries[i])) {
			return true;
		}
	}

	return false;
}

/**
 * エントリ ID を基準に、前方に統合先があるかを判定する。
 */
export function hasSquashTargetBeforeEntry(
	entries: Pick<RebaseEntry, "id" | "command">[],
	entryId: string,
): boolean {
	const index = entries.findIndex((entry) => entry.id === entryId);
	return hasSquashTargetBeforeIndex(entries, index);
}

/**
 * squash / fixup が最終的に統合される先頭コミット行を返す。
 * 直前に fixup / squash が並んでいても、連鎖の起点になる commit 行を探す。
 */
export function findSquashTarget(
	entries: RebaseEntry[],
	index: number,
): RebaseEntry | null {
	for (let i = index - 1; i >= 0; i--) {
		const entry = entries[i];
		if (isSquashTargetCommandType(entry.command.type)) {
			return entry;
		}
	}

	return null;
}

/**
 * 「すべて1つにまとめる」で対象にする、コミット系エントリ数を数える。
 */
export function countSquashableEntries(
	entries: Pick<RebaseEntry, "command">[],
): number {
	return entries.filter((entry) => isSquashableEntry(entry)).length;
}

/**
 * 最初のコミット系エントリを残し、それ以降のコミット系エントリだけを fixup 化する。
 * drop や特殊コマンドはそのまま残す。
 */
export function squashAllEntries(entries: RebaseEntry[]): RebaseEntry[] {
	let foundFirstSquashTarget = false;

	return entries.map((entry) => {
		if (!isSquashableEntry(entry)) {
			return entry;
		}

		if (!foundFirstSquashTarget) {
			foundFirstSquashTarget = true;
			return entry;
		}

		return { ...entry, command: { type: "fixup" as const } };
	});
}

/**
 * 先頭のコミット系エントリが squash / fixup の場合は Git が失敗するため、事前に弾く。
 */
export function getRebaseValidationError(
	entries: RebaseEntry[],
): string | null {
	for (const entry of entries) {
		if (!isSquashableEntry(entry)) {
			continue;
		}

		const commandType = entry.command.type;
		if (commandType === "squash" || commandType === "fixup") {
			return "先頭のコミットにsquash/fixupは使用できません。統合先のコミットがありません。";
		}

		break;
	}

	return null;
}
