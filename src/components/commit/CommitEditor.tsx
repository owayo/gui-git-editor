import { useState } from "react";
import { SparklesIcon } from "@heroicons/react/24/outline";
import { useCommitStore } from "../../stores";
import { SubjectInput } from "./SubjectInput";
import { BodyTextarea } from "./BodyTextarea";
import { TrailersDisplay } from "./TrailersDisplay";
import { generateCommitMessageFromStaged } from "../../types/ipc";
import { getErrorMessage } from "../../types/errors";

export function CommitEditor() {
  const {
    subject,
    body,
    trailers,
    comments,
    diffContent,
    setSubject,
    setBody,
  } = useCommitStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const handleGenerateWithAI = async (withBody: boolean) => {
    setIsGenerating(true);
    setGenerateError(null);

    const result = await generateCommitMessageFromStaged(withBody);

    if (result.ok) {
      // Parse the generated message into subject and body
      const lines = result.data.split("\n");
      const newSubject = lines[0] || "";
      // Body starts after the first blank line
      const bodyStartIndex = lines.findIndex((line, i) => i > 0 && line === "");
      const newBody =
        bodyStartIndex > 0 ? lines.slice(bodyStartIndex + 1).join("\n") : "";

      setSubject(newSubject);
      setBody(newBody);
    } else {
      setGenerateError(getErrorMessage(result.error));
    }

    setIsGenerating(false);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          コミットメッセージ
        </h2>
        <div className="flex items-center gap-2">
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
      </div>

      {/* Error display */}
      {generateError && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {generateError}
        </div>
      )}

      {/* Instructions */}
      <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
        <p>
          件名は50文字以内、本文は各行72文字以内が推奨されています。
          空行を挟んで件名と本文を分けてください。
        </p>
      </div>

      {/* Subject input */}
      <SubjectInput value={subject} onChange={setSubject} />

      {/* Body textarea */}
      <div className="flex-1">
        <BodyTextarea value={body} onChange={setBody} />
      </div>

      {/* Trailers and comments */}
      <TrailersDisplay
        trailers={trailers}
        comments={comments}
        diffContent={diffContent}
      />

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
      </div>
    </div>
  );
}
