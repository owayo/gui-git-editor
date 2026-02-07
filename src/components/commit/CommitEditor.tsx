import { SparklesIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useCommitStore, useFileStore } from "../../stores";
import { getErrorMessage } from "../../types/errors";
import {
	checkGitScAvailable,
	generateCommitMessageFromStaged,
} from "../../types/ipc";
import { getShortcut } from "../../utils/platform";
import { BodyTextarea } from "./BodyTextarea";
import { StagingArea } from "./StagingArea";
import { SubjectInput } from "./SubjectInput";
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

	const filePath = useFileStore((s) => s.filePath);

	const [isGenerating, setIsGenerating] = useState(false);
	const [generateError, setGenerateError] = useState<string | null>(null);
	const [gitScAvailable, setGitScAvailable] = useState<boolean | null>(null);

	useEffect(() => {
		checkGitScAvailable().then((r) => setGitScAvailable(r.ok ? r.data : false));
	}, []);

	const handleGenerateWithAI = async (withBody: boolean) => {
		setIsGenerating(true);
		setGenerateError(null);

		const result = await generateCommitMessageFromStaged(withBody);

		if (result.ok) {
			const lines = result.data.split("\n");
			const newSubject = lines[0] || "";
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
		<div className="flex h-full gap-0">
			{/* Left: Message editor */}
			<div className="flex min-w-0 flex-1 flex-col gap-4">
				{/* Header */}
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
						コミットメッセージ
					</h2>
					{gitScAvailable && (
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={() => handleGenerateWithAI(false)}
								disabled={isGenerating}
								className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<SparklesIcon className="h-4 w-4" />
								{isGenerating ? "生成中..." : "Subject のみ"}
							</button>
							<button
								type="button"
								onClick={() => handleGenerateWithAI(true)}
								disabled={isGenerating}
								className="flex items-center gap-1.5 rounded-md bg-purple-700 px-3 py-1.5 text-sm text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
							>
								<SparklesIcon className="h-4 w-4" />
								{isGenerating ? "生成中..." : "Subject + Description"}
							</button>
						</div>
					)}
				</div>

				{/* Error display */}
				{generateError && (
					<div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
						{generateError}
					</div>
				)}

				{/* Instructions */}
				<div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
					<p>Subject は 50 文字以内、Description は各行 72 文字以内を推奨</p>
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
							{getShortcut("S")}
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

			{/* Divider */}
			<div className="w-px bg-gray-200 dark:bg-gray-700" />

			{/* Right: Staging area */}
			{filePath && (
				<div className="w-[460px] shrink-0 overflow-hidden pl-4">
					<StagingArea filePath={filePath} />
				</div>
			)}
		</div>
	);
}
