import { useCommitStore } from "../../stores";
import { SubjectInput } from "./SubjectInput";
import { BodyTextarea } from "./BodyTextarea";
import { TrailersDisplay } from "./TrailersDisplay";

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

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          コミットメッセージ
        </h2>
      </div>

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
