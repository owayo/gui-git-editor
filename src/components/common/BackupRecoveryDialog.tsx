import { useEffect, useRef, useCallback } from "react";
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

interface BackupRecoveryDialogProps {
  onRestore: () => void;
  onDiscard: () => void;
}

export function BackupRecoveryDialog({
  onRestore,
  onDiscard,
}: BackupRecoveryDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap and keyboard handling
  // Note: Escape key intentionally does NOT close this dialog
  // because discarding backup is a destructive action that should require explicit user action
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Focus trap
    if (e.key === "Tab" && dialogRef.current) {
      const focusableElements = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[
        focusableElements.length - 1
      ] as HTMLElement;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }
  }, []);

  // Focus management and event listeners
  useEffect(() => {
    // Focus the restore button when dialog opens
    restoreButtonRef.current?.focus();

    // Add keyboard event listener
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-dialog-title"
        aria-describedby="backup-dialog-description"
        className="mx-4 max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30"
            aria-hidden="true"
          >
            <ExclamationTriangleIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div className="flex-1">
            <h3
              id="backup-dialog-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              バックアップが見つかりました
            </h3>
            <p
              id="backup-dialog-description"
              className="mt-2 text-sm text-gray-600 dark:text-gray-400"
            >
              前回のセッションで保存されていない変更があります。
              バックアップから復元しますか？
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onDiscard}
            aria-label="バックアップを破棄"
            className="flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <TrashIcon className="h-4 w-4" aria-hidden="true" />
            破棄
          </button>
          <button
            ref={restoreButtonRef}
            type="button"
            onClick={onRestore}
            aria-label="バックアップから復元"
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
            復元
          </button>
        </div>
      </div>
    </div>
  );
}
