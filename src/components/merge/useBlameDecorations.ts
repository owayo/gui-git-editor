import type * as MonacoEditor from "monaco-editor";
import { useEffect, useRef } from "react";
import type { BlameLine } from "../../types/git";

/**
 * Monaco editor に git blame の hover tooltip を適用する。
 * glyph margin または行番号領域の hover 時に blame 情報を表示する。
 * 同じコミットハッシュの連続行は 1 つの decoration にまとめる。
 */
export function useBlameDecorations(
	editorRef: React.RefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>,
	blameData: BlameLine[] | null,
	editorReady: boolean,
) {
	const decorationIds = useRef<string[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: エディタのマウント時に再実行するため editorReady を依存に含める
	useEffect(() => {
		const editor = editorRef.current;
		if (!editor || !blameData || blameData.length === 0) {
			return;
		}

		const monaco = (window as unknown as { monaco: typeof MonacoEditor })
			.monaco;
		if (!monaco) return;

		// 同じコミットハッシュの連続行をまとめる。
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
