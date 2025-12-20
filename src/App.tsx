import { useEffect, useCallback, useState } from "react";
import { getMatches } from "@tauri-apps/plugin-cli";
import {
  useFileStore,
  useRebaseStore,
  useCommitStore,
  useHistoryStore,
} from "./stores";
import { useKeyboardShortcuts, useAutoBackup } from "./hooks";
import {
  ActionBar,
  BackupRecoveryDialog,
  ErrorDisplay,
  Loading,
} from "./components/common";
import { RebaseEditor } from "./components/rebase";
import { CommitEditor } from "./components/commit";
import { FallbackEditor } from "./components/fallback";
import {
  checkBackupExists,
  deleteBackup,
  exitApp,
  restoreBackup,
} from "./types/ipc";

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

  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [pendingBackupPath, setPendingBackupPath] = useState<string | null>(
    null
  );

  const isLoading = fileLoading || rebaseLoading || commitLoading;
  const error = fileError || rebaseError || commitError;

  // Auto-backup hook
  const { clearBackup } = useAutoBackup({
    filePath,
    isDirty,
  });

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

          // Check for existing backup
          const backupResult = await checkBackupExists(targetPath);
          if (backupResult.ok && backupResult.data) {
            setPendingBackupPath(backupResult.data);
            setShowBackupDialog(true);
          }

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
      // Clear backup on successful save
      await clearBackup();
      await exitApp(0);
    }
  }, [
    fileType,
    isCommitType,
    serialize,
    serializeCommit,
    setContent,
    saveFile,
    clearBackup,
  ]);

  // Handle cancel
  const handleCancel = useCallback(async () => {
    if (filePath) {
      await deleteBackup(filePath);
    }
    await exitApp(1);
  }, [filePath]);

  // Handle backup restore
  const handleRestoreBackup = useCallback(async () => {
    if (!filePath || !pendingBackupPath) return;

    const result = await restoreBackup(pendingBackupPath, filePath);
    if (result.ok) {
      await loadFile(filePath);
    }
    setShowBackupDialog(false);
    setPendingBackupPath(null);
  }, [filePath, pendingBackupPath, loadFile]);

  // Handle backup discard
  const handleDiscardBackup = useCallback(async () => {
    if (filePath) {
      await deleteBackup(filePath);
    }
    setShowBackupDialog(false);
    setPendingBackupPath(null);
  }, [filePath]);

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
      <ActionBar
        onSave={handleSave}
        onCancel={handleCancel}
        onUndo={fileType === "rebase_todo" ? handleUndo : undefined}
        onRedo={fileType === "rebase_todo" ? handleRedo : undefined}
        canUndo={canUndo()}
        canRedo={canRedo()}
        isSaving={isSaving}
        isDirty={fileType === "rebase_todo" ? rebaseIsDirty : isDirty}
        saveLabel={fileType === "rebase_todo" ? "Rebaseを開始" : "保存"}
      />

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

      {/* Footer with file info */}
      <footer className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        <span className="font-mono">{filePath}</span>
        <span className="mx-2">•</span>
        <span>{fileType}</span>
      </footer>

      {/* Backup recovery dialog */}
      {showBackupDialog && (
        <BackupRecoveryDialog
          onRestore={handleRestoreBackup}
          onDiscard={handleDiscardBackup}
        />
      )}
    </div>
  );
}

export default App;
