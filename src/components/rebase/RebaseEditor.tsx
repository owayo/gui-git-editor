import { useCallback, useEffect, useState } from "react";
import { useFileStore, useRebaseStore } from "../../stores";
import type { RebaseEntry, SimpleCommand } from "../../types/git";
import { getModifierKey, getShortcut } from "../../utils/platform";
import {
	countSquashableEntries,
	hasSquashTargetBeforeEntry,
} from "../../utils/rebase";
import { CommitChangeViewer } from "./CommitChangeViewer";
import { RebaseEntryList } from "./RebaseEntryList";
import { RewordModal } from "./RewordModal";

/** コミットメッセージ先頭の `#` を表示用に取り除く。 */
function cleanMessage(message: string): string {
	return message.replace(/^#\s*/, "");
}

const COMMAND_SHORTCUTS: Record<string, SimpleCommand> = {
	p: "pick",
	r: "reword",
	e: "edit",
	s: "squash",
	f: "fixup",
	d: "drop",
};

/**
 * 後続の squash / fixup で統合されるコミットのハッシュを集める。
 * AI 生成時に統合対象の変更をまとめて渡すために使う。
 */
function collectRelatedHashes(
	entries: RebaseEntry[],
	entryId: string,
): string[] {
	const index = entries.findIndex((e) => e.id === entryId);
	if (index === -1) return [];

	const relatedHashes: string[] = [];

	// 後続エントリを順に見ていく
	for (let i = index + 1; i < entries.length; i++) {
		const entry = entries[i];
		const cmdType = entry.command.type;

		// squash / fixup だけを関連コミットとして扱う
		if (cmdType === "squash" || cmdType === "fixup") {
			relatedHashes.push(entry.commit_hash);
		} else {
			// 連続した squash / fixup の塊が途切れたら終了する
			break;
		}
	}

	return relatedHashes;
}

export function RebaseEditor() {
	const {
		entries,
		comments,
		selectedEntryId,
		selectEntry,
		moveEntry,
		updateEntryCommand,
		setSimpleCommand,
		updateEntryMessage,
		squashAll,
	} = useRebaseStore();

	const filePath = useFileStore((s) => s.filePath);

	// 右側の変更ビューアに表示する選択中エントリ
	const selectedEntry = entries.find((e) => e.id === selectedEntryId);
	const selectedCommitHash = selectedEntry?.commit_hash || null;
	const selectedMessage = selectedEntry?.message || "";

	// Reword ダイアログの表示状態
	const [rewordEntry, setRewordEntry] = useState<RebaseEntry | null>(null);
	const squashableEntryCount = countSquashableEntries(entries);

	// コマンド変更や並べ替えに使うキーボードショートカット
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// 入力中はショートカットを無効化する
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement ||
				event.target instanceof HTMLSelectElement
			) {
				return;
			}

			// Cmd+↑/↓ または Ctrl+↑/↓ で選択中エントリを移動する
			if (
				(event.metaKey || event.ctrlKey) &&
				(event.key === "ArrowUp" || event.key === "ArrowDown")
			) {
				event.preventDefault();
				if (!selectedEntryId) return;

				const currentIndex = entries.findIndex((e) => e.id === selectedEntryId);
				if (currentIndex === -1) return;

				if (event.key === "ArrowUp" && currentIndex > 0) {
					moveEntry(currentIndex, currentIndex - 1);
				} else if (
					event.key === "ArrowDown" &&
					currentIndex < entries.length - 1
				) {
					moveEntry(currentIndex, currentIndex + 1);
				}
				return;
			}

			// Shift+F でコミット系エントリだけを 1 つにまとめる
			if (
				event.shiftKey &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey &&
				event.key.toLowerCase() === "f"
			) {
				if (squashableEntryCount >= 2) {
					event.preventDefault();
					squashAll();
				}
				return;
			}

			// 上記以外は修飾キー付きショートカットとして扱わない
			if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
				return;

			const command = COMMAND_SHORTCUTS[event.key.toLowerCase()];
			if (command && selectedEntryId) {
				// 統合先がない fixup / squash は Git 実行時に失敗するため防ぐ
				if (
					(command === "squash" || command === "fixup") &&
					!hasSquashTargetBeforeEntry(entries, selectedEntryId)
				) {
					return;
				}
				event.preventDefault();
				setSimpleCommand(selectedEntryId, command);

				// `r` では reword ダイアログも開く
				if (command === "reword") {
					const entry = entries.find((e) => e.id === selectedEntryId);
					if (entry) {
						setRewordEntry(entry);
					}
				}
			}

			// 矢印キーで一覧選択を移動する
			if (event.key === "ArrowUp" || event.key === "ArrowDown") {
				event.preventDefault();
				const currentIndex = entries.findIndex((e) => e.id === selectedEntryId);
				if (event.key === "ArrowUp" && currentIndex > 0) {
					selectEntry(entries[currentIndex - 1].id);
				} else if (
					event.key === "ArrowDown" &&
					currentIndex < entries.length - 1
				) {
					selectEntry(entries[currentIndex + 1].id);
				} else if (currentIndex === -1 && entries.length > 0) {
					selectEntry(entries[0].id);
				}
			}
		},
		[
			selectedEntryId,
			entries,
			squashableEntryCount,
			setSimpleCommand,
			selectEntry,
			moveEntry,
			squashAll,
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	// Reword ダイアログの保存処理
	const handleRewordSave = useCallback(
		(newMessage: string) => {
			if (rewordEntry) {
				updateEntryMessage(rewordEntry.id, newMessage);
				setRewordEntry(null);
			}
		},
		[rewordEntry, updateEntryMessage],
	);

	const handleRewordCancel = useCallback(() => {
		setRewordEntry(null);
	}, []);

	// 一覧から reword が選ばれたときもダイアログを開く
	const handleCommandChange = useCallback(
		(id: string, command: import("../../types/git").RebaseCommandType) => {
			updateEntryCommand(id, command);

			// reword 選択時はメッセージ編集をすぐ開始する
			if (command.type === "reword") {
				const entry = entries.find((e) => e.id === id);
				if (entry) {
					setRewordEntry(entry);
				}
			}
		},
		[entries, updateEntryCommand],
	);

	return (
		<div className="flex h-full gap-0">
			{/* 左側: rebase エントリ一覧 */}
			<div className="flex min-w-0 flex-1 flex-col gap-4">
				{/* ヘッダーと件数表示 */}
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
						Rebase エントリ
					</h2>
					<div className="flex items-center gap-2">
						{squashableEntryCount >= 2 && (
							<button
								type="button"
								onClick={squashAll}
								className="rounded-md bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
							>
								すべて1つにまとめる
								<kbd className="ml-1.5 rounded bg-purple-200 px-1 py-0.5 font-mono text-xs dark:bg-purple-800">
									Shift+F
								</kbd>
							</button>
						)}
						<span className="rounded-full bg-gray-200 px-3 py-1 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-400">
							{entries.length} 件
						</span>
					</div>
				</div>

				{/* 操作ガイド */}
				<div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
					<p>
						ドラッグ&ドロップで順序を変更できます。コマンドを選択してアクションを変更してください。
					</p>
				</div>

				{/* エントリ一覧 */}
				<div className="flex-1 overflow-auto">
					<RebaseEntryList
						entries={entries}
						selectedEntryId={selectedEntryId}
						onSelectEntry={selectEntry}
						onReorder={moveEntry}
						onCommandChange={handleCommandChange}
					/>
				</div>

				{/* コメントは必要なときだけ展開できる */}
				{comments.length > 0 && (
					<details className="rounded-lg border border-gray-200 dark:border-gray-700">
						<summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800">
							コメント ({comments.length} 行)
						</summary>
						<div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
							<pre className="font-mono text-xs whitespace-pre-wrap text-gray-500 dark:text-gray-500">
								{comments.join("\n")}
							</pre>
						</div>
					</details>
				)}

				{/* キーボードショートカット一覧 */}
				<div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-500">
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							p
						</kbd>{" "}
						pick
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							r
						</kbd>{" "}
						reword
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							e
						</kbd>{" "}
						edit
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							s
						</kbd>{" "}
						squash
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							f
						</kbd>{" "}
						fixup
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							d
						</kbd>{" "}
						drop
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							↑↓
						</kbd>{" "}
						選択
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							{getModifierKey()}+↑↓
						</kbd>{" "}
						順序変更
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							Shift+F
						</kbd>{" "}
						全まとめ
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							{getShortcut("Z")}
						</kbd>{" "}
						戻す
					</span>
					<span>
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							{getShortcut("S")}
						</kbd>{" "}
						保存
					</span>
				</div>
			</div>

			{/* 区切り線 */}
			<div className="w-px bg-gray-200 dark:bg-gray-700" />

			{/* 右側: 選択中コミットの変更表示 */}
			{filePath && selectedCommitHash && (
				<div className="w-[460px] shrink-0 overflow-hidden pl-4">
					<CommitChangeViewer
						commitHash={selectedCommitHash}
						message={selectedMessage}
						filePath={filePath}
					/>
				</div>
			)}

			{/* Reword ダイアログ */}
			<RewordModal
				isOpen={rewordEntry !== null}
				commitHash={rewordEntry?.commit_hash ?? ""}
				relatedHashes={
					rewordEntry ? collectRelatedHashes(entries, rewordEntry.id) : []
				}
				initialMessage={rewordEntry ? cleanMessage(rewordEntry.message) : ""}
				onSave={handleRewordSave}
				onCancel={handleRewordCancel}
			/>
		</div>
	);
}
