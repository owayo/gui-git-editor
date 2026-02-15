import type { CommitFileInfo } from "../../types/git";
import { FileStatusBadge } from "../commit/FileStatusBadge";

interface CommitFileListProps {
	files: CommitFileInfo[];
	selectedFile: string | null;
	onSelectFile: (path: string) => void;
}

export function CommitFileList({
	files,
	selectedFile,
	onSelectFile,
}: CommitFileListProps) {
	if (files.length === 0) {
		return (
			<div className="p-3 text-center text-sm text-gray-500 dark:text-gray-400">
				変更ファイルなし
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			{files.map((file) => {
				const isSelected = selectedFile === file.path;
				return (
					<button
						type="button"
						key={file.path}
						onClick={() => onSelectFile(file.path)}
						className={`flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
							isSelected
								? "bg-blue-100 dark:bg-blue-900/40"
								: "hover:bg-gray-100 dark:hover:bg-gray-800"
						}`}
					>
						<FileStatusBadge status={file.status} />
						<span className="min-w-0 truncate text-gray-700 dark:text-gray-300">
							{file.path}
						</span>
						{file.originalPath && (
							<span className="shrink-0 text-xs text-gray-400">
								← {file.originalPath}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
