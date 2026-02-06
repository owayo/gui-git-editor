import type * as MonacoEditor from "monaco-editor";
import { useEffect, useRef } from "react";
import type { ConflictRegion } from "../../types/git";

/**
 * Find line ranges in a side panel file where conflict content appears.
 * Searches sequentially since conflicts appear in file order.
 */
function findContentLineRanges(
	fileLines: string[],
	conflicts: ConflictRegion[],
	side: "local" | "remote",
): Array<{ startLine: number; endLine: number }> {
	const ranges: Array<{ startLine: number; endLine: number }> = [];
	let searchFrom = 0;

	for (const conflict of conflicts) {
		const content =
			side === "local" ? conflict.localContent : conflict.remoteContent;
		if (!content) continue;

		const contentLines = content.split("\n");
		// Remove trailing empty line if content ends with \n
		if (
			contentLines.length > 0 &&
			contentLines[contentLines.length - 1] === ""
		) {
			contentLines.pop();
		}
		if (contentLines.length === 0) continue;

		for (let i = searchFrom; i <= fileLines.length - contentLines.length; i++) {
			let match = true;
			for (let j = 0; j < contentLines.length; j++) {
				if (fileLines[i + j] !== contentLines[j]) {
					match = false;
					break;
				}
			}
			if (match) {
				ranges.push({
					startLine: i + 1, // 1-based for Monaco
					endLine: i + contentLines.length, // 1-based, inclusive
				});
				searchFrom = i + contentLines.length;
				break;
			}
		}
	}

	return ranges;
}

/**
 * Apply red conflict background decorations to LOCAL or REMOTE side panels.
 * Highlights persist even after conflicts are resolved in MERGED,
 * since the side panel files never change.
 */
export function useSidePanelConflictDecorations(
	editorRef: React.RefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>,
	fileContent: string | null,
	conflicts: ConflictRegion[],
	side: "local" | "remote",
	editorReady: boolean,
) {
	const decorationIds = useRef<string[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: editorReady triggers re-run when editor mounts (editorRef.current is null until then)
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || !fileContent) return;

		const monaco = (window as unknown as { monaco: typeof MonacoEditor })
			.monaco;
		if (!monaco) return;

		const fileLines = fileContent.split("\n");
		const ranges = findContentLineRanges(fileLines, conflicts, side);

		const decorations: MonacoEditor.editor.IModelDeltaDecoration[] = ranges.map(
			(range) => ({
				range: new monaco.Range(range.startLine, 1, range.endLine, 1),
				options: {
					isWholeLine: true,
					className: "conflict-region-bg",
				},
			}),
		);

		decorationIds.current = editor.deltaDecorations(
			decorationIds.current,
			decorations,
		);

		return () => {
			if (editor.getModel()) {
				decorationIds.current = editor.deltaDecorations(
					decorationIds.current,
					[],
				);
			}
		};
	}, [editorRef, fileContent, conflicts, side, editorReady]);
}
