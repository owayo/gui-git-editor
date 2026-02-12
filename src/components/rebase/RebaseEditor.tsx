import { useCallback, useEffect, useState } from "react";
import { useRebaseStore } from "../../stores";
import type { RebaseEntry, SimpleCommand } from "../../types/git";
import { getModifierKey, getShortcut } from "../../utils/platform";
import { RebaseEntryList } from "./RebaseEntryList";
import { RewordModal } from "./RewordModal";

/** Remove leading # from commit message if present */
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
 * Check if an entry can be squashed/fixup'd.
 * An entry can only be squash/fixup if there's a valid target commit before it
 * (i.e., a commit that is not drop).
 */
function canSquashOrFixupEntry(
	entries: { id: string; command: { type: string } }[],
	entryId: string,
): boolean {
	const index = entries.findIndex((e) => e.id === entryId);
	if (index <= 0) return false;

	// Check all entries before this one
	for (let i = 0; i < index; i++) {
		const entry = entries[i];
		// A valid target is any command that's not drop
		if (entry.command.type !== "drop") {
			return true;
		}
	}
	return false;
}

/**
 * Collect related commit hashes for squash/fixup entries.
 * When a commit has subsequent squash/fixup commands, their changes
 * will be combined, so we need all their hashes for AI message generation.
 */
function collectRelatedHashes(
	entries: RebaseEntry[],
	entryId: string,
): string[] {
	const index = entries.findIndex((e) => e.id === entryId);
	if (index === -1) return [];

	const relatedHashes: string[] = [];

	// Look at subsequent entries
	for (let i = index + 1; i < entries.length; i++) {
		const entry = entries[i];
		const cmdType = entry.command.type;

		// Collect squash and fixup entries
		if (cmdType === "squash" || cmdType === "fixup") {
			relatedHashes.push(entry.commit_hash);
		} else {
			// Stop when we hit a non-squash/fixup command
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

	// State for reword modal
	const [rewordEntry, setRewordEntry] = useState<RebaseEntry | null>(null);

	// Keyboard shortcuts for command changes
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// Ignore if typing in an input
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement ||
				event.target instanceof HTMLSelectElement
			) {
				return;
			}

			// Cmd+↑/↓: Move selected entry up/down
			if (
				event.metaKey &&
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

			// Ignore other shortcuts if modifier keys are pressed
			if (event.ctrlKey || event.metaKey || event.altKey) return;

			const command = COMMAND_SHORTCUTS[event.key.toLowerCase()];
			if (command && selectedEntryId) {
				// Check if squash/fixup is allowed for this entry
				if (
					(command === "squash" || command === "fixup") &&
					!canSquashOrFixupEntry(entries, selectedEntryId)
				) {
					return; // Don't allow squash/fixup if no valid target before it
				}
				event.preventDefault();
				setSimpleCommand(selectedEntryId, command);

				// Open reword modal when 'r' is pressed
				if (command === "reword") {
					const entry = entries.find((e) => e.id === selectedEntryId);
					if (entry) {
						setRewordEntry(entry);
					}
				}
			}

			// Arrow key navigation
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
		[selectedEntryId, entries, setSimpleCommand, selectEntry, moveEntry],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	// Reword modal handlers
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

	// Wrap command change to open modal when reword is selected
	const handleCommandChange = useCallback(
		(id: string, command: import("../../types/git").RebaseCommandType) => {
			updateEntryCommand(id, command);

			// Open reword modal when reword command is selected
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
		<div className="flex h-full flex-col gap-4">
			{/* Header with entry count */}
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
					Rebase エントリ
				</h2>
				<div className="flex items-center gap-2">
					{entries.length >= 2 && (
						<button
							type="button"
							onClick={squashAll}
							className="rounded-md bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50"
						>
							すべて1つにまとめる
						</button>
					)}
					<span className="rounded-full bg-gray-200 px-3 py-1 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-400">
						{entries.length} 件
					</span>
				</div>
			</div>

			{/* Instructions */}
			<div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
				<p>
					ドラッグ&ドロップで順序を変更できます。コマンドを選択してアクションを変更してください。
				</p>
			</div>

			{/* Entry list */}
			<div className="flex-1 overflow-auto">
				<RebaseEntryList
					entries={entries}
					selectedEntryId={selectedEntryId}
					onSelectEntry={selectEntry}
					onReorder={moveEntry}
					onCommandChange={handleCommandChange}
				/>
			</div>

			{/* Comments section (collapsed by default) */}
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

			{/* Keyboard shortcuts help */}
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

			{/* Reword modal */}
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
