import type * as MonacoEditor from "monaco-editor";
import { useEffect, useRef } from "react";
import type { ConflictRegion } from "../../types/git";

/**
 * Apply conflict-related decorations to a Monaco editor instance.
 * Highlights LOCAL (green), REMOTE (blue), and conflict marker lines (red).
 */
export function useConflictDecorations(
	editorRef: React.RefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>,
	conflicts: ConflictRegion[],
) {
	const decorationIds = useRef<string[]>([]);

	useEffect(() => {
		const editor = editorRef.current;
		if (!editor) return;

		const monaco = (window as unknown as { monaco: typeof MonacoEditor })
			.monaco;
		if (!monaco) return;

		const decorations: MonacoEditor.editor.IModelDeltaDecoration[] = [];

		for (const conflict of conflicts) {
			if (conflict.resolved) continue;

			// <<<<<<< marker line
			decorations.push({
				range: new monaco.Range(
					conflict.startLine + 1,
					1,
					conflict.startLine + 1,
					1,
				),
				options: {
					isWholeLine: true,
					className: "conflict-marker-line",
					glyphMarginClassName: "conflict-glyph-marker",
				},
			});

			// LOCAL content lines (green)
			if (conflict.localEndLine > conflict.localStartLine) {
				decorations.push({
					range: new monaco.Range(
						conflict.localStartLine + 1,
						1,
						conflict.localEndLine,
						1,
					),
					options: {
						isWholeLine: true,
						className: "conflict-local-bg",
					},
				});
			}

			// REMOTE content lines (blue)
			if (conflict.remoteEndLine > conflict.remoteStartLine) {
				decorations.push({
					range: new monaco.Range(
						conflict.remoteStartLine + 1,
						1,
						conflict.remoteEndLine,
						1,
					),
					options: {
						isWholeLine: true,
						className: "conflict-remote-bg",
					},
				});
			}

			// ======= separator line
			const separatorLine = conflict.baseStartLine
				? (conflict.baseEndLine ?? conflict.localEndLine) + 1
				: conflict.localEndLine + 1;
			decorations.push({
				range: new monaco.Range(separatorLine, 1, separatorLine, 1),
				options: {
					isWholeLine: true,
					className: "conflict-marker-line",
				},
			});

			// >>>>>>> marker line
			decorations.push({
				range: new monaco.Range(
					conflict.endLine + 1,
					1,
					conflict.endLine + 1,
					1,
				),
				options: {
					isWholeLine: true,
					className: "conflict-marker-line",
				},
			});
		}

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
	}, [editorRef, conflicts]);
}
