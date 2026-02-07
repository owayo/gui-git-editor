import type * as MonacoEditor from "monaco-editor";
import { useEffect, useRef } from "react";
import type { BlameLine } from "../../types/git";

/**
 * Apply git blame hover tooltips to a Monaco editor.
 * Shows blame info when hovering over the glyph margin or line number area.
 * Groups consecutive lines with the same commit hash into a single decoration.
 */
export function useBlameDecorations(
	editorRef: React.RefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>,
	blameData: BlameLine[] | null,
	editorReady: boolean,
) {
	const decorationIds = useRef<string[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: editorReady triggers re-run when editor mounts
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || !blameData || blameData.length === 0) {
			return;
		}

		const monaco = (window as unknown as { monaco: typeof MonacoEditor })
			.monaco;
		if (!monaco) return;

		// Group consecutive lines with the same commit hash
		const groups: Array<{
			startLine: number;
			endLine: number;
			blame: BlameLine;
		}> = [];

		for (const line of blameData) {
			const last = groups[groups.length - 1];
			if (
				last &&
				last.blame.hash === line.hash &&
				line.lineNumber === last.endLine + 1
			) {
				last.endLine = line.lineNumber;
			} else {
				groups.push({
					startLine: line.lineNumber,
					endLine: line.lineNumber,
					blame: line,
				});
			}
		}

		const hoverMsg = (
			group: (typeof groups)[number],
		): MonacoEditor.IMarkdownString => ({
			value: `**${group.blame.hash}** ${group.blame.summary}  \n${group.blame.author} \u2014 ${group.blame.date}`,
		});

		const decorations: MonacoEditor.editor.IModelDeltaDecoration[] = groups.map(
			(group) => ({
				range: new monaco.Range(group.startLine, 1, group.endLine, 1),
				options: {
					isWholeLine: true,
					glyphMarginClassName: "blame-glyph",
					glyphMarginHoverMessage: hoverMsg(group),
					hoverMessage: hoverMsg(group),
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
	}, [editorRef, blameData, editorReady]);
}
