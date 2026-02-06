import type * as MonacoEditor from "monaco-editor";
import { useEffect, useRef } from "react";
import type { ConflictRegion } from "../../types/git";

/**
 * Find line ranges in the merged content where a resolved conflict's
 * replacement text appears. Uses sequential search since conflicts
 * appear in file order.
 */
function findReplacementLineRange(
	contentLines: string[],
	replacement: string,
	searchFrom: number,
): { startLine: number; endLine: number; nextSearchFrom: number } | null {
	const replacementLines = replacement.split("\n");
	if (replacementLines.length === 0) return null;

	for (
		let i = searchFrom;
		i <= contentLines.length - replacementLines.length;
		i++
	) {
		let match = true;
		for (let j = 0; j < replacementLines.length; j++) {
			if (contentLines[i + j] !== replacementLines[j]) {
				match = false;
				break;
			}
		}
		if (match) {
			return {
				startLine: i + 1, // 1-based for Monaco
				endLine: i + replacementLines.length, // 1-based, inclusive
				nextSearchFrom: i + replacementLines.length,
			};
		}
	}
	return null;
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
	mergedContent: string | null,
	resolvedReplacements: Record<number, string>,
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

		// For resolved conflicts, search the merged content for replacement text
		const contentLines = mergedContent?.split("\n") ?? [];
		let searchFrom = 0;

		for (const conflict of conflicts) {
			if (conflict.resolved) {
				// Find the replacement text in the merged content
				const replacement = resolvedReplacements[conflict.id];
				if (replacement === undefined || !mergedContent) continue;

				const range = findReplacementLineRange(
					contentLines,
					replacement,
					searchFrom,
				);
				if (range) {
					decorations.push({
						range: new monaco.Range(range.startLine, 1, range.endLine, 1),
						options: {
							isWholeLine: true,
							className: "conflict-region-bg",
						},
					});
					searchFrom = range.nextSearchFrom;
				}
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
	}, [editorRef, conflicts, editorReady, mergedContent, resolvedReplacements]);
}
