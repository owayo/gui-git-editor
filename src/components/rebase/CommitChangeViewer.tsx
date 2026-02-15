import { useEffect } from "react";
import { useCommitDiffStore } from "../../stores";
import { getErrorMessage } from "../../types/errors";
import { FileDiffViewer } from "../commit/FileDiffViewer";
import { CommitFileList } from "./CommitFileList";

interface CommitChangeViewerProps {
	commitHash: string;
	message: string;
	filePath: string;
}

export function CommitChangeViewer({
	commitHash,
	message,
	filePath,
}: CommitChangeViewerProps) {
	const {
		files,
		selectedFile,
		diffContent,
		isLoadingFiles,
		isLoadingDiff,
		error,
		fetchFiles,
		selectFile,
	} = useCommitDiffStore();

	useEffect(() => {
		fetchFiles(filePath, commitHash);
	}, [filePath, commitHash, fetchFiles]);

	const handleSelectFile = (targetFile: string) => {
		selectFile(filePath, commitHash, targetFile);
	};

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="shrink-0 border-b border-gray-200 pb-2 dark:border-gray-700">
				<div className="flex items-center gap-2">
					<code className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
						{commitHash.slice(0, 7)}
					</code>
					<span className="min-w-0 truncate text-sm text-gray-700 dark:text-gray-300">
						{message}
					</span>
				</div>
			</div>

			{/* Error */}
			{error && (
				<div className="shrink-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
					{getErrorMessage(error)}
				</div>
			)}

			{/* Loading */}
			{isLoadingFiles && (
				<div className="flex items-center justify-center p-4 text-sm text-gray-500 dark:text-gray-400">
					ファイル一覧を読み込み中...
				</div>
			)}

			{/* Content */}
			{!isLoadingFiles && !error && (
				<div className="flex min-h-0 flex-1 flex-col">
					{/* File list */}
					<div
						className="shrink-0 overflow-auto border-b border-gray-200 dark:border-gray-700"
						style={{ maxHeight: "40%" }}
					>
						<CommitFileList
							files={files}
							selectedFile={selectedFile}
							onSelectFile={handleSelectFile}
						/>
					</div>

					{/* Diff viewer */}
					<div className="min-h-0 flex-1 overflow-auto">
						{selectedFile ? (
							<FileDiffViewer
								diff={diffContent ?? ""}
								isLoading={isLoadingDiff}
							/>
						) : (
							<div className="flex items-center justify-center p-4 text-sm text-gray-500 dark:text-gray-400">
								ファイルを選択して差分を表示
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
