import { useEffect, useCallback } from "react";
import { useRebaseStore } from "../../stores";
import { RebaseEntryList } from "./RebaseEntryList";
import type { SimpleCommand } from "../../types/git";

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
  entryId: string
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

export function RebaseEditor() {
  const {
    entries,
    comments,
    selectedEntryId,
    selectEntry,
    moveEntry,
    updateEntryCommand,
    setSimpleCommand,
  } = useRebaseStore();

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
    [selectedEntryId, entries, setSimpleCommand, selectEntry, moveEntry]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header with entry count */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Rebase エントリ
        </h2>
        <span className="rounded-full bg-gray-200 px-3 py-1 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          {entries.length} 件
        </span>
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
          onCommandChange={updateEntryCommand}
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
            ⌘↑↓
          </kbd>{" "}
          順序変更
        </span>
        <span>
          <kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
            Ctrl+Z
          </kbd>{" "}
          戻す
        </span>
        <span>
          <kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
            Ctrl+S
          </kbd>{" "}
          保存
        </span>
      </div>
    </div>
  );
}
