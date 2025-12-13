import { useEffect, useCallback } from "react";
import { getMatches } from "@tauri-apps/plugin-cli";
import { useFileStore, useRebaseStore, useHistoryStore } from "./stores";
import { useKeyboardShortcuts } from "./hooks";
import { ActionBar, ErrorDisplay, Loading } from "./components/common";
import { RebaseEditor } from "./components/rebase";
import { exitApp } from "./types/ipc";

function App() {
  const {
    filePath,
    fileType,
    currentContent,
    isLoading: fileLoading,
    isSaving,
    error: fileError,
    isDirty,
    loadFile,
    saveFile,
    setContent,
    clearError: clearFileError,
  } = useFileStore();

  const {
    entries,
    isLoading: rebaseLoading,
    error: rebaseError,
    parseContent,
    serialize,
    setEntries,
    clearError: clearRebaseError,
  } = useRebaseStore();

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    pushSnapshot,
    clear: clearHistory,
  } = useHistoryStore();

  const isLoading = fileLoading || rebaseLoading;
  const error = fileError || rebaseError;

  // Load file from CLI arguments on mount
  useEffect(() => {
    async function loadFromCli() {
      try {
        const matches = await getMatches();
        const args = matches.args;

        if (args.file && typeof args.file.value === "string") {
          await loadFile(args.file.value);
        }
      } catch (err) {
        console.error("Failed to get CLI matches:", err);
      }
    }

    loadFromCli();
  }, [loadFile]);

  // Parse rebase content when file is loaded
  useEffect(() => {
    if (fileType === "rebase_todo" && currentContent) {
      parseContent(currentContent);
    }
  }, [fileType, currentContent, parseContent]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (fileType === "rebase_todo") {
      const serialized = await serialize();
      if (serialized) {
        setContent(serialized);
        const success = await saveFile();
        if (success) {
          await exitApp(0);
        }
      }
    } else {
      const success = await saveFile();
      if (success) {
        await exitApp(0);
      }
    }
  }, [fileType, serialize, setContent, saveFile]);

  // Handle cancel
  const handleCancel = useCallback(async () => {
    await exitApp(1);
  }, []);

  // Handle undo
  const handleUndo = useCallback(() => {
    const previousEntries = undo();
    if (previousEntries) {
      setEntries(previousEntries);
    }
  }, [undo, setEntries]);

  // Handle redo
  const handleRedo = useCallback(() => {
    const nextEntries = redo();
    if (nextEntries) {
      setEntries(nextEntries);
    }
  }, [redo, setEntries]);

  // Push snapshot when entries change
  useEffect(() => {
    if (entries.length > 0) {
      pushSnapshot(entries);
    }
  }, [entries, pushSnapshot]);

  // Clear history when file changes
  useEffect(() => {
    clearHistory();
  }, [filePath, clearHistory]);

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    onSave: handleSave,
    onCancel: handleCancel,
    onUndo: handleUndo,
    onRedo: handleRedo,
  });

  const clearError = useCallback(() => {
    clearFileError();
    clearRebaseError();
  }, [clearFileError, clearRebaseError]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-screen flex-col bg-white dark:bg-gray-900">
        <Loading message="ファイルを読み込み中..." />
      </div>
    );
  }

  // Show error if no file is loaded
  if (!filePath) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400">
          ファイルが指定されていません
        </p>
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
          使用方法: gui-git-editor &lt;ファイルパス&gt;
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white dark:bg-gray-900">
      <ActionBar
        onSave={handleSave}
        onCancel={handleCancel}
        onUndo={fileType === "rebase_todo" ? handleUndo : undefined}
        onRedo={fileType === "rebase_todo" ? handleRedo : undefined}
        canUndo={canUndo()}
        canRedo={canRedo()}
        isSaving={isSaving}
        isDirty={isDirty}
      />

      {error && (
        <div className="p-4">
          <ErrorDisplay error={error} onDismiss={clearError} />
        </div>
      )}

      <main className="flex-1 overflow-auto p-4">
        {fileType === "rebase_todo" ? (
          <RebaseEditor />
        ) : (
          <div className="text-gray-600 dark:text-gray-300">
            {/* CommitMessageEditor will be implemented later */}
            <p>Commit Message Editor (実装予定)</p>
            <pre className="mt-4 rounded-lg bg-gray-100 p-4 font-mono text-sm whitespace-pre-wrap dark:bg-gray-800">
              {currentContent}
            </pre>
          </div>
        )}
      </main>

      {/* Footer with file info */}
      <footer className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        <span className="font-mono">{filePath}</span>
        <span className="mx-2">•</span>
        <span>{fileType}</span>
      </footer>
    </div>
  );
}

export default App;
