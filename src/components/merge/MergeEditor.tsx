import type { MergeFilePaths } from "../../types/git";

interface MergeEditorProps {
	filePaths: MergeFilePaths;
}

export function MergeEditor({ filePaths }: MergeEditorProps) {
	return (
		<div className="flex h-full items-center justify-center">
			<div className="text-center">
				<p className="text-lg text-gray-500 dark:text-gray-400">
					マージエディタ（準備中）
				</p>
				<p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
					MERGED: {filePaths.merged}
				</p>
			</div>
		</div>
	);
}
