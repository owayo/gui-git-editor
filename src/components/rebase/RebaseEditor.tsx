import { useRebaseStore } from "../../stores";
import { RebaseEntryList } from "./RebaseEntryList";

export function RebaseEditor() {
  const {
    entries,
    comments,
    selectedEntryId,
    selectEntry,
    moveEntry,
    updateEntryCommand,
  } = useRebaseStore();

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
      <div className="flex flex-wrap gap-4 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-500">
        <span>
          <kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
            Ctrl+S
          </kbd>{" "}
          保存
        </span>
        <span>
          <kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
            Esc
          </kbd>{" "}
          キャンセル
        </span>
        <span>
          <kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
            Ctrl+Z
          </kbd>{" "}
          元に戻す
        </span>
        <span>
          <kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
            Ctrl+Shift+Z
          </kbd>{" "}
          やり直す
        </span>
      </div>
    </div>
  );
}
