import { useEffect, useCallback } from "react";
import { getMatches } from "@tauri-apps/plugin-cli";
import {
  useFileStore,
  useRebaseStore,
  useCommitStore,
  useHistoryStore,
} from "./stores";
import { useKeyboardShortcuts } from "./hooks";
import { ActionBar, ErrorDisplay, Loading } from "./components/common";
import { RebaseEditor } from "./components/rebase";
import { CommitEditor } from "./components/commit";
import { FallbackEditor } from "./components/fallback";
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
    isDirty: rebaseIsDirty,
    parseContent,
    serialize,
    setEntries,
    clearError: clearRebaseError,
  } = useRebaseStore();

  const {
    isLoading: commitLoading,
    error: commitError,
    isDirty: commitIsDirty,
    parseContent: parseCommitContent,
    serialize: serializeCommit,
    clearError: clearCommitError,
  } = useCommitStore();

  const {
    canUndo,
    canRedo,
    undo,
    redo,
    pushSnapshot,
    clear: clearHistory,
  } = useHistoryStore();

  const isLoading = fileLoading || rebaseLoading || commitLoading;
  const error = fileError || rebaseError || commitError;

  // Check if file is a commit message type
  const isCommitType =
    fileType === "commit_msg" ||
    fileType === "merge_msg" ||
    fileType === "squash_msg" ||
    fileType === "tag_msg";

  // Load file from CLI arguments on mount
  useEffect(() => {
    async function loadFromCli() {
      try {
        const matches = await getMatches();
        const args = matches.args;

        if (args.file && typeof args.file.value === "string") {
          const targetPath = args.file.value;
          await loadFile(targetPath);
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

  // Parse commit content when file is loaded
  useEffect(() => {
    if (isCommitType && currentContent) {
      parseCommitContent(currentContent);
    }
  }, [isCommitType, currentContent, parseCommitContent]);

  // Handle save
  const handleSave = useCallback(async () => {
    let success = false;

    if (fileType === "rebase_todo") {
      const serialized = await serialize();
      if (serialized) {
        setContent(serialized);
        success = await saveFile();
      }
    } else if (isCommitType) {
      const serialized = await serializeCommit();
      if (serialized) {
        setContent(serialized);
        success = await saveFile();
      }
    } else {
      success = await saveFile();
    }

    if (success) {
      await exitApp(0);
    }
  }, [
    fileType,
    isCommitType,
    serialize,
    serializeCommit,
    setContent,
    saveFile,
  ]);

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
    clearCommitError();
  }, [clearFileError, clearRebaseError, clearCommitError]);

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
      {error && (
        <div className="p-4">
          <ErrorDisplay error={error} onDismiss={clearError} />
        </div>
      )}

      <main className="flex-1 overflow-auto p-4">
        {fileType === "rebase_todo" ? (
          <RebaseEditor />
        ) : isCommitType ? (
          <CommitEditor />
        ) : (
          <FallbackEditor />
        )}
      </main>

      <ActionBar
        onSave={handleSave}
        onCancel={handleCancel}
        onUndo={fileType === "rebase_todo" ? handleUndo : undefined}
        onRedo={fileType === "rebase_todo" ? handleRedo : undefined}
        canUndo={canUndo()}
        canRedo={canRedo()}
        isSaving={isSaving}
        isDirty={
          fileType === "rebase_todo"
            ? rebaseIsDirty
            : isCommitType
              ? commitIsDirty
              : isDirty
        }
        saveLabel={fileType === "rebase_todo" ? "Rebaseを開始" : "保存"}
      />
    </div>
  );
}

export default App;
