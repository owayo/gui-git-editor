import { useCallback } from "react";
import { useMergeStore } from "../../stores";
import type * as MonacoEditor from "monaco-editor";

interface ConflictNavigatorProps {
	editorRef: React.RefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>;
}

export function ConflictNavigator({ editorRef }: ConflictNavigatorProps) {
	const {
		conflicts,
		currentConflictIndex,
		allResolved,
		goToNextConflict,
		goToPrevConflict,
	} = useMergeStore();

	const unresolvedCount = conflicts.filter((c) => !c.resolved).length;
	const currentPosition =
		unresolvedCount > 0
			? conflicts
					.filter((c) => !c.resolved)
					.findIndex(
						(_, i, arr) =>
							arr[i] ===
							conflicts.find(
								(c, idx) => !c.resolved && idx >= currentConflictIndex,
							),
					) + 1
			: 0;

	const scrollToLine = useCallback(
		(line: number | null) => {
			if (line === null || !editorRef.current) return;
			editorRef.current.revealLineInCenter(line + 1);
		},
		[editorRef],
	);

	const handleNext = useCallback(() => {
		const line = goToNextConflict();
		scrollToLine(line);
	}, [goToNextConflict, scrollToLine]);

	const handlePrev = useCallback(() => {
		const line = goToPrevConflict();
		scrollToLine(line);
	}, [goToPrevConflict, scrollToLine]);

	return (
		<div className="flex items-center gap-2">
			{allResolved ? (
				<span className="text-xs font-medium text-green-600 dark:text-green-400">
					すべてのコンフリクトが解決済み
				</span>
			) : (
				<>
					<span className="text-xs text-gray-600 dark:text-gray-400">
						コンフリクト: {currentPosition}/{unresolvedCount}
					</span>
					<button
						type="button"
						onClick={handlePrev}
						disabled={unresolvedCount === 0}
						className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
					>
						&#x25B2; 前
					</button>
					<button
						type="button"
						onClick={handleNext}
						disabled={unresolvedCount === 0}
						className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
					>
						次 &#x25BC;
					</button>
				</>
			)}
		</div>
	);
}
