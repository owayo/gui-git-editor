import type * as MonacoEditor from "monaco-editor";
import { useEffect, useRef } from "react";
import type { ConflictRegion, ResolvedReplacement } from "../../types/git";

/**
 * MERGED パネルの Monaco editor にコンフリクト関連の decoration を適用する。
 * - 未解決コンフリクト: マーカー行（赤）、LOCAL 内容、REMOTE 内容
 * - 解決済みコンフリクト: 置換テキスト領域の赤背景
 */
export function useConflictDecorations(
	editorRef: React.RefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>,
	conflicts: ConflictRegion[],
	editorReady: boolean,
	resolvedReplacements: Record<number, ResolvedReplacement>,
) {
	const decorationIds = useRef<string[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: エディタのマウント時に再実行するため editorReady を依存に含める
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor) return;

		const monaco = (window as unknown as { monaco: typeof MonacoEditor })
			.monaco;
		if (!monaco) return;

		const decorations: MonacoEditor.editor.IModelDeltaDecoration[] = [];

		for (const conflict of conflicts) {
			if (conflict.resolved) {
				// 保存済み行アンカーを使って解決済み置換ブロックを装飾する。
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

			// <<<<<<< マーカー行。
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

			// LOCAL 内容行。
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

			// REMOTE 内容行。
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

			// ======= 区切り行。
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

			// >>>>>>> マーカー行。
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
