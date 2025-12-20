import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getShortcut } from "../../utils/platform";

interface ActionBarProps {
  onSave: () => void;
  onCancel: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isSaving?: boolean;
  isDirty?: boolean;
  saveLabel?: string;
  /** Validation error message - disables save button when present */
  validationError?: string | null;
}

export function ActionBar({
  onSave,
  onCancel,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  isSaving = false,
  isDirty = false,
  saveLabel = "保存",
  validationError = null,
}: ActionBarProps) {
  const canSave = isDirty && !isSaving && !validationError;
  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-100 px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
      {/* Left side: Undo/Redo */}
      <div className="flex items-center gap-1">
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="元に戻す"
            title={`元に戻す (${getShortcut("Z")})`}
          >
            <ArrowUturnLeftIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        {onRedo && (
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="やり直す"
            title={`やり直す (${getShortcut("Z", true)})`}
          >
            <ArrowUturnRightIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Center: Status */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex items-center gap-2 text-sm"
      >
        {validationError ? (
          <>
            <span
              className="h-2 w-2 rounded-full bg-red-500"
              aria-hidden="true"
            />
            <span className="text-red-600 dark:text-red-400">
              {validationError}
            </span>
          </>
        ) : isSaving ? (
          <span className="text-blue-600 dark:text-blue-400">保存中...</span>
        ) : isDirty ? (
          <>
            <span
              className="h-2 w-2 rounded-full bg-amber-500"
              aria-hidden="true"
            />
            <span className="text-amber-600 dark:text-amber-400">
              未保存の変更
            </span>
          </>
        ) : null}
      </div>

      {/* Right side: Cancel, Save */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label="キャンセル"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
          title="キャンセル (Esc)"
        >
          <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">キャンセル</span>
        </button>

        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          aria-label={isSaving ? "処理中" : saveLabel}
          aria-busy={isSaving}
          className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={`保存して終了 (${getShortcut("S")})`}
        >
          <CheckIcon className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">{isSaving ? "処理中..." : saveLabel}</span>
        </button>
      </div>
    </div>
  );
}
