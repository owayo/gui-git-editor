import type * as MonacoEditor from "monaco-editor";
import { useEffect, useRef } from "react";
import type { ConflictRegion } from "../../types/git";

/**
 * サイドパネルファイル内でコンフリクト内容が現れる行範囲を探す。
 * コンフリクトはファイル順に現れるため、前方から順に検索する。
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
		// 内容が \n で終わる場合の末尾空行を取り除く。
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
 * LOCAL または REMOTE サイドパネルへ赤いコンフリクト背景 decoration を適用する。
 * サイドパネルのファイル内容は変わらないため、MERGED 側で解決してもハイライトは残す。
 */
export function useSidePanelConflictDecorations(
	editorRef: React.RefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>,
	fileContent: string | null,
	conflicts: ConflictRegion[],
	side: "local" | "remote",
	editorReady: boolean,
) {
	const decorationIds = useRef<string[]>([]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: エディタのマウント時に再実行するため editorReady を依存に含める
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
