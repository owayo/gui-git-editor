import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
} from "react";
import { useMergeStore } from "../../stores";
import type { MergeFilePaths } from "../../types/git";
import { ErrorDisplay, Loading } from "../common";
import { MonacoPanel } from "./MonacoPanel";
import type * as MonacoEditor from "monaco-editor";

interface MergeEditorProps {
	filePaths: MergeFilePaths;
}

export function MergeEditor({ filePaths }: MergeEditorProps) {
	const {
		localContent,
		remoteContent,
		baseContent,
		mergedContent,
		language,
		isLoading,
		error,
		initMerge,
		updateMergedContent,
		clearError,
	} = useMergeStore();

	const [showBase, setShowBase] = useState(false);
	const [panelSizes, setPanelSizes] = useState([1, 1, 1]);
	const [isResizing, setIsResizing] = useState(false);
	const [resizeIndex, setResizeIndex] = useState<number | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Editor refs for scroll sync
	const localEditorRef =
		useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
	const mergedEditorRef =
		useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);
	const remoteEditorRef =
		useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(null);

	// Scroll sync lock to prevent infinite loops
	const isScrollSyncing = useRef(false);

	// Initialize merge on mount
	useEffect(() => {
		initMerge(
			filePaths.local,
			filePaths.remote,
			filePaths.base,
			filePaths.merged,
		);
	}, [filePaths, initMerge]);

	// Scroll sync handler
	const handleScrollChange = useCallback(
		(sourceEditor: "local" | "merged" | "remote") => (scrollTop: number) => {
			if (isScrollSyncing.current) return;
			isScrollSyncing.current = true;

			const editors = {
				local: localEditorRef.current,
				merged: mergedEditorRef.current,
				remote: remoteEditorRef.current,
			};

			for (const [key, editor] of Object.entries(editors)) {
				if (key !== sourceEditor && editor) {
					editor.setScrollTop(scrollTop);
				}
			}

			requestAnimationFrame(() => {
				isScrollSyncing.current = false;
			});
		},
		[],
	);

	// Panel resize handlers
	const handleResizeStart = useCallback(
		(index: number) => (e: ReactMouseEvent) => {
			e.preventDefault();
			setIsResizing(true);
			setResizeIndex(index);
		},
		[],
	);

	useEffect(() => {
		if (!isResizing || resizeIndex === null) return;

		const handleMouseMove = (e: globalThis.MouseEvent) => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			const totalWidth = rect.width;
			const mouseX = e.clientX - rect.left;
			const ratio = mouseX / totalWidth;

			setPanelSizes((prev) => {
				const newSizes = [...prev];
				const total = newSizes.reduce((a, b) => a + b, 0);

				if (resizeIndex === 0) {
					const leftSize = Math.max(0.15, Math.min(0.7, ratio)) * total;
					const diff = leftSize - newSizes[0];
					newSizes[0] = leftSize;
					newSizes[1] = Math.max(0.15 * total, newSizes[1] - diff);
				} else if (resizeIndex === 1) {
					const rightStart = ratio * total;
					const leftSize = newSizes[0];
					newSizes[1] = Math.max(0.15 * total, rightStart - leftSize);
					newSizes[2] = Math.max(0.15 * total, total - leftSize - newSizes[1]);
				}

				return newSizes;
			});
		};

		const handleMouseUp = () => {
			setIsResizing(false);
			setResizeIndex(null);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);
		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isResizing, resizeIndex]);

	if (isLoading) {
		return <Loading message="マージファイルを読み込み中..." />;
	}

	if (error) {
		return (
			<div className="p-4">
				<ErrorDisplay error={error} onDismiss={clearError} />
			</div>
		);
	}

	if (!localContent || !remoteContent || !mergedContent) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-gray-500 dark:text-gray-400">
					ファイルの読み込みを待っています...
				</p>
			</div>
		);
	}

	const totalSize = panelSizes.reduce((a, b) => a + b, 0);

	return (
		<div className="flex h-full flex-col">
			{/* Toolbar */}
			<div className="flex items-center gap-2 border-b border-gray-200 px-3 py-1.5 dark:border-gray-700">
				<button
					type="button"
					onClick={() => setShowBase(!showBase)}
					className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
						showBase
							? "bg-gray-700 text-white dark:bg-gray-300 dark:text-gray-900"
							: "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
					}`}
				>
					BASE {showBase ? "▼" : "▶"}
				</button>
			</div>

			{/* BASE panel (togglable) */}
			{showBase && baseContent !== null && (
				<div className="h-48 border-b border-gray-200 dark:border-gray-700">
					<MonacoPanel
						label="BASE"
						content={baseContent}
						language={language}
						readOnly
					/>
				</div>
			)}

			{/* 3-panel layout */}
			<div
				ref={containerRef}
				className="flex flex-1 overflow-hidden"
				style={{ cursor: isResizing ? "col-resize" : undefined }}
			>
				{/* LOCAL panel */}
				<div
					style={{
						flex: `${panelSizes[0] / totalSize}`,
						minWidth: "15%",
					}}
				>
					<MonacoPanel
						label="LOCAL"
						content={localContent}
						language={language}
						readOnly
						editorRef={localEditorRef}
						onScrollChange={handleScrollChange("local")}
					/>
				</div>

				{/* biome-ignore lint/a11y/useSemanticElements: div is appropriate for drag-based resizer */}
				<div
					role="separator"
					tabIndex={0}
					aria-orientation="vertical"
					aria-valuenow={Math.round((panelSizes[0] / totalSize) * 100)}
					className="w-1 cursor-col-resize bg-gray-300 hover:bg-blue-500 dark:bg-gray-600 dark:hover:bg-blue-400"
					onMouseDown={handleResizeStart(0)}
				/>

				{/* MERGED panel */}
				<div
					style={{
						flex: `${panelSizes[1] / totalSize}`,
						minWidth: "15%",
					}}
				>
					<MonacoPanel
						label="MERGED"
						content={mergedContent}
						language={language}
						onChange={updateMergedContent}
						editorRef={mergedEditorRef}
						onScrollChange={handleScrollChange("merged")}
					/>
				</div>

				{/* biome-ignore lint/a11y/useSemanticElements: div is appropriate for drag-based resizer */}
				<div
					role="separator"
					tabIndex={0}
					aria-orientation="vertical"
					aria-valuenow={Math.round(
						((panelSizes[0] + panelSizes[1]) / totalSize) * 100,
					)}
					className="w-1 cursor-col-resize bg-gray-300 hover:bg-blue-500 dark:bg-gray-600 dark:hover:bg-blue-400"
					onMouseDown={handleResizeStart(1)}
				/>

				{/* REMOTE panel */}
				<div
					style={{
						flex: `${panelSizes[2] / totalSize}`,
						minWidth: "15%",
					}}
				>
					<MonacoPanel
						label="REMOTE"
						content={remoteContent}
						language={language}
						readOnly
						editorRef={remoteEditorRef}
						onScrollChange={handleScrollChange("remote")}
					/>
				</div>
			</div>
		</div>
	);
}
