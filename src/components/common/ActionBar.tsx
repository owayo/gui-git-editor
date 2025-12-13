import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  CheckIcon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
} from "@heroicons/react/24/outline";
import { useThemeStore } from "../../stores";

interface ActionBarProps {
  onSave: () => void;
  onCancel: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isSaving?: boolean;
  isDirty?: boolean;
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
}: ActionBarProps) {
  const { resolvedTheme, toggleTheme } = useThemeStore();

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
      {/* Left side: Undo/Redo */}
      <div className="flex items-center gap-1">
        {onUndo && (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="元に戻す"
            title="元に戻す (Ctrl+Z)"
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
            title="やり直す (Ctrl+Shift+Z)"
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
        className="text-sm text-gray-500 dark:text-gray-400"
      >
        {isSaving && "保存中..."}
        {!isSaving && isDirty && "未保存の変更があります"}
      </div>

      {/* Right side: Theme toggle, Cancel, Save */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
          aria-label={
            resolvedTheme === "dark" ? "ライトモード" : "ダークモード"
          }
          title={
            resolvedTheme === "dark"
              ? "ライトモードに切り替え"
              : "ダークモードに切り替え"
          }
        >
          {resolvedTheme === "dark" ? (
            <SunIcon className="h-5 w-5" aria-hidden="true" />
          ) : (
            <MoonIcon className="h-5 w-5" aria-hidden="true" />
          )}
        </button>

        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

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
          disabled={isSaving || !isDirty}
          aria-label={isSaving ? "保存中" : "保存して終了"}
          aria-busy={isSaving}
          className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          title="保存して終了 (Ctrl+S)"
        >
          <CheckIcon className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm">{isSaving ? "保存中..." : "保存"}</span>
        </button>
      </div>
    </div>
  );
}
