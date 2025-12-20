import { useState, useEffect, useCallback, useRef } from "react";
import { XMarkIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { generateCommitMessage } from "../../types/ipc";
import { getErrorMessage } from "../../types/errors";

interface RewordModalProps {
  isOpen: boolean;
  commitHash: string;
  /** Additional hashes for squash/fixup commits */
  relatedHashes?: string[];
  initialMessage: string;
  onSave: (message: string) => void;
  onCancel: () => void;
}

export function RewordModal({
  isOpen,
  commitHash,
  relatedHashes = [],
  initialMessage,
  onSave,
  onCancel,
}: RewordModalProps) {
  const [message, setMessage] = useState(initialMessage);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset message when modal opens with new initial message
  useEffect(() => {
    if (isOpen) {
      setMessage(initialMessage);
      setGenerateError(null);
      // Focus textarea when modal opens
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 0);
    }
  }, [isOpen, initialMessage]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return;

      // Escape to cancel
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }

      // Cmd/Ctrl+Enter to save
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        if (message.trim() && !isGenerating) {
          onSave(message);
        }
      }
    },
    [isOpen, message, isGenerating, onSave, onCancel]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSave = () => {
    if (message.trim()) {
      onSave(message);
    }
  };

  const handleGenerateWithAI = async (withBody: boolean) => {
    setIsGenerating(true);
    setGenerateError(null);

    // Collect all hashes (main + related squash/fixup)
    const hashes = [commitHash, ...relatedHashes];

    const result = await generateCommitMessage(hashes, withBody);

    if (result.ok) {
      setMessage(result.data);
      // Focus textarea after generation
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 0);
    } else {
      setGenerateError(getErrorMessage(result.error));
    }

    setIsGenerating(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              コミットメッセージを編集
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-mono text-amber-600 dark:text-amber-400">
                {commitHash.slice(0, 7)}
              </span>
              {relatedHashes.length > 0 && (
                <span className="ml-2 text-purple-600 dark:text-purple-400">
                  +{relatedHashes.length} コミット
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            aria-label="閉じる"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <div className="mb-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => handleGenerateWithAI(false)}
              disabled={isGenerating}
              className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SparklesIcon className="h-4 w-4" />
              {isGenerating ? "生成中..." : "タイトルのみ"}
            </button>
            <button
              type="button"
              onClick={() => handleGenerateWithAI(true)}
              disabled={isGenerating}
              className="flex items-center gap-1.5 rounded-md bg-purple-700 px-3 py-1.5 text-sm text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SparklesIcon className="h-4 w-4" />
              {isGenerating ? "生成中..." : "本文も生成"}
            </button>
          </div>

          {generateError && (
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {generateError}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isGenerating}
            className="h-40 w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            placeholder="コミットメッセージを入力..."
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
              ⌘+Enter
            </kbd>{" "}
            で保存
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isGenerating}
              className="rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!message.trim() || isGenerating}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
