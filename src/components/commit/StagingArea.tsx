import {
	ArrowPathIcon,
	FolderIcon,
	PlusCircleIcon,
} from "@heroicons/react/24/outline";
import { useEffect } from "react";
import { useStagingStore } from "../../stores";
import { getErrorMessage } from "../../types/errors";
import { FileDiffViewer } from "./FileDiffViewer";
import { FileList } from "./FileList";

interface StagingAreaProps {
	filePath: string;
}

export function StagingArea({ filePath }: StagingAreaProps) {
	const {
		staged,
		unstaged,
		untracked,
		repoRoot,
		branchName,
		selectedFile,
		diffContent,
		isLoadingStatus,
		isLoadingDiff,
		isOperating,
		error,
		fetchStatus,
		stageFile,
		unstageFile,
		stageAll,
		selectFile,
		clearError,
	} = useStagingStore();

	useEffect(() => {
		fetchStatus(filePath);
	}, [filePath, fetchStatus]);

	const handleStage = (target: string) => {
		stageFile(filePath, target);
	};

	const handleUnstage = (target: string) => {
		unstageFile(filePath, target);
	};

	const handleStageAll = () => {
		stageAll(filePath);
	};

	const handleSelectStaged = (path: string) => {
		selectFile(path, true, filePath);
	};

	const handleSelectUnstaged = (path: string) => {
		selectFile(path, false, filePath);
	};

	const handleRefresh = () => {
		fetchStatus(filePath);
	};

	const totalChanges = staged.length + unstaged.length + untracked.length;

	return (
		<div className="flex h-full flex-col">
			{/* Repo info */}
			{repoRoot && (
				<div className="mb-2 space-y-1 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
					<div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
						<FolderIcon className="h-3.5 w-3.5 shrink-0" />
						<span className="truncate font-mono" title={repoRoot}>
							{repoRoot}
						</span>
					</div>
					{branchName && (
						<div className="flex items-center gap-1.5 text-xs">
							<svg
								className="h-3.5 w-3.5 shrink-0 text-gray-600 dark:text-gray-400"
								fill="none"
								viewBox="0 0 24 24"
								strokeWidth={2}
								stroke="currentColor"
								role="img"
								aria-label="ブランチ"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									d="M7 7v10M17 7v4a4 4 0 01-4 4H7"
								/>
								<circle cx="7" cy="7" r="2" />
								<circle cx="7" cy="17" r="2" />
								<circle cx="17" cy="7" r="2" />
							</svg>
							<span className="font-mono font-medium text-purple-600 dark:text-purple-400">
								{branchName}
							</span>
						</div>
					)}
				</div>
			)}

			{/* Header */}
			<div className="mb-2 flex items-center justify-between">
				<h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
					変更ファイル
					{!isLoadingStatus && (
						<span className="ml-1 text-xs font-normal text-gray-500">
							({totalChanges})
						</span>
					)}
				</h3>
				<div className="flex items-center gap-1">
					{(unstaged.length > 0 || untracked.length > 0) && (
						<button
							type="button"
							onClick={handleStageAll}
							disabled={isOperating}
							className="flex items-center gap-1 rounded px-2 py-1 text-xs text-green-600 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
							title="すべてステージに追加"
						>
							<PlusCircleIcon className="h-4 w-4" />
							全ステージ
						</button>
					)}
					<button
						type="button"
						onClick={handleRefresh}
						disabled={isLoadingStatus}
						className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
						title="リフレッシュ"
					>
						<ArrowPathIcon
							className={`h-4 w-4 ${isLoadingStatus ? "animate-spin" : ""}`}
						/>
					</button>
				</div>
			</div>

			{/* Error */}
			{error && (
				<div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
					{getErrorMessage(error)}
					<button type="button" onClick={clearError} className="ml-2 underline">
						閉じる
					</button>
				</div>
			)}

			{/* Loading */}
			{isLoadingStatus && totalChanges === 0 && (
				<div className="flex items-center justify-center py-8 text-sm text-gray-500">
					読み込み中...
				</div>
			)}

			{/* Empty state */}
			{!isLoadingStatus && totalChanges === 0 && (
				<div className="flex items-center justify-center py-8 text-sm text-gray-500 dark:text-gray-400">
					変更されたファイルはありません
				</div>
			)}

			{/* File lists */}
			<div className="flex-1 space-y-2 overflow-auto">
				<FileList
					title="ステージ済み"
					files={staged}
					actionType="unstage"
					selectedPath={selectedFile?.staged ? selectedFile.path : null}
					disabled={isOperating}
					onAction={handleUnstage}
					onSelect={handleSelectStaged}
				/>

				<FileList
					title="未ステージ"
					files={unstaged}
					actionType="stage"
					selectedPath={
						selectedFile && !selectedFile.staged ? selectedFile.path : null
					}
					disabled={isOperating}
					onAction={handleStage}
					onSelect={handleSelectUnstaged}
				/>

				<FileList
					title="未追跡"
					files={untracked}
					actionType="stage"
					selectedPath={null}
					disabled={isOperating}
					onAction={handleStage}
					onSelect={handleSelectUnstaged}
				/>
			</div>

			{/* Diff viewer */}
			{selectedFile && (
				<div className="mt-2 max-h-64 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
					<div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
						{selectedFile.path}
						<span className="ml-2 text-gray-400">
							({selectedFile.staged ? "ステージ済み" : "未ステージ"})
						</span>
					</div>
					<FileDiffViewer diff={diffContent ?? ""} isLoading={isLoadingDiff} />
				</div>
			)}
		</div>
	);
}
