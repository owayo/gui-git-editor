import {
	ChevronDownIcon,
	ChevronRightIcon,
	MinusIcon,
	PlusIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import type { FileStatus } from "../../types/git";
import { FileStatusBadge } from "./FileStatusBadge";

interface FileListProps {
	title: string;
	files: FileStatus[];
	actionType: "stage" | "unstage";
	selectedPath: string | null;
	disabled: boolean;
	onAction: (path: string) => void;
	onSelect: (path: string) => void;
}

export function FileList({
	title,
	files,
	actionType,
	selectedPath,
	disabled,
	onAction,
	onSelect,
}: FileListProps) {
	const [expanded, setExpanded] = useState(true);

	if (files.length === 0) {
		return null;
	}

	return (
		<div className="rounded-lg border border-gray-200 dark:border-gray-700">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
			>
				{expanded ? (
					<ChevronDownIcon className="h-4 w-4 shrink-0" />
				) : (
					<ChevronRightIcon className="h-4 w-4 shrink-0" />
				)}
				{title} ({files.length})
			</button>
			{expanded && (
				<div className="border-t border-gray-200 dark:border-gray-700">
					{files.map((file) => {
						const status =
							actionType === "unstage"
								? file.indexStatus
								: file.worktreeStatus === "?"
									? "?"
									: file.worktreeStatus;
						const isSelected = selectedPath === file.path;

						return (
							<div
								key={file.path}
								className={`flex items-center gap-2 px-3 py-1 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
									isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
								}`}
							>
								<FileStatusBadge status={status} />
								<button
									type="button"
									className="min-w-0 flex-1 truncate text-left font-mono text-xs text-gray-700 dark:text-gray-300"
									onClick={() => onSelect(file.path)}
									title={file.path}
								>
									{file.path}
									{file.originalPath && (
										<span className="text-gray-400">
											{" "}
											← {file.originalPath}
										</span>
									)}
								</button>
								<button
									type="button"
									onClick={() => onAction(file.path)}
									disabled={disabled}
									className="shrink-0 rounded p-0.5 text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 dark:hover:bg-gray-700 dark:hover:text-gray-300"
									title={
										actionType === "stage"
											? "ステージに追加"
											: "ステージから除外"
									}
								>
									{actionType === "stage" ? (
										<PlusIcon className="h-4 w-4" />
									) : (
										<MinusIcon className="h-4 w-4" />
									)}
								</button>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
