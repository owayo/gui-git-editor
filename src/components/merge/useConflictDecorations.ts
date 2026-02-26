import type * as MonacoEditor from "monaco-editor";
import { useEffect, useRef } from "react";
import type { ConflictRegion } from "../../types/git";

interface ResolvedReplacement {
	text: string;
	startLine: number;
	lineCount: number;
}

/**
 * Apply conflict-related decorations to the MERGED panel Monaco editor.
 * - Unresolved conflicts: marker lines (red), LOCAL content, REMOTE content
 * - Resolved conflicts: red background on the replacement text region
 */
export function useConflictDecorations(
	editorRef: React.RefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>,
	conflicts: ConflictRegion[],
	editorReady: boolean,
	resolvedReplacements: Record<number, ResolvedReplacement>,
) {
	const decorationIds = useRef<string[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: editorReady triggers re-run when editor mounts (editorRef.current is null until then)
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor) return;

		const monaco = (window as unknown as { monaco: typeof MonacoEditor })
			.monaco;
		if (!monaco) return;

		const decorations: MonacoEditor.editor.IModelDeltaDecoration[] = [];

		for (const conflict of conflicts) {
			if (conflict.resolved) {
				// Use stored line anchors to decorate resolved replacement blocks.
				const replacement = resolvedReplacements[conflict.id];
				if (replacement === undefined) continue;

				const startLine = replacement.startLine + 1;
				const endLine =
					replacement.lineCount > 0
						? replacement.startLine + replacement.lineCount
						: replacement.startLine + 1;
				decorations.push({
					range: new monaco.Range(startLine, 1, endLine, 1),
					options: {
						isWholeLine: true,
						className: "conflict-region-bg",
					},
				});
				continue;
			}

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

			// LOCAL content lines
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

			// REMOTE content lines
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
	}, [editorRef, conflicts, editorReady, resolvedReplacements]);
}
