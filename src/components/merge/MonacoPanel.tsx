import Editor, { type OnMount } from "@monaco-editor/react";
import type * as MonacoEditor from "monaco-editor";
import { useCallback, useRef } from "react";
import { useThemeStore } from "../../stores";

export type PanelLabel = "LOCAL" | "MERGED" | "REMOTE" | "BASE";

interface MonacoPanelProps {
	label: PanelLabel;
	displayLabel?: string;
	content: string;
	language: string;
	readOnly?: boolean;
	onChange?: (value: string) => void;
	onScrollChange?: (scrollTop: number) => void;
	editorRef?: React.MutableRefObject<MonacoEditor.editor.IStandaloneCodeEditor | null>;
	onEditorReady?: () => void;
}

const LABEL_COLORS: Record<PanelLabel, string> = {
	LOCAL: "bg-green-600",
	MERGED: "bg-yellow-600",
	REMOTE: "bg-blue-600",
	BASE: "bg-gray-600",
};

export function MonacoPanel({
	label,
	displayLabel,
	content,
	language,
	readOnly = false,
	onChange,
	onScrollChange,
	editorRef,
	onEditorReady,
}: MonacoPanelProps) {
	const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
	const internalRef = useRef<MonacoEditor.editor.IStandaloneCodeEditor | null>(
		null,
	);

	const handleEditorMount: OnMount = useCallback(
		(editor) => {
			if (editorRef) {
				editorRef.current = editor;
			}
			internalRef.current = editor;

			if (onScrollChange) {
				editor.onDidScrollChange((e) => {
					onScrollChange(e.scrollTop);
				});
			}

			onEditorReady?.();
		},
		[editorRef, onScrollChange, onEditorReady],
	);

	const handleChange = useCallback(
		(value: string | undefined) => {
			if (onChange && value !== undefined) {
				onChange(value);
			}
		},
		[onChange],
	);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div
				className={`flex items-center px-3 py-1.5 ${LABEL_COLORS[label]} text-xs font-semibold text-white`}
			>
				{displayLabel ?? label}
			</div>
			<div className="flex-1 overflow-hidden">
				<Editor
					theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
					language={language}
					value={content}
					onChange={handleChange}
					onMount={handleEditorMount}
					options={{
						readOnly,
						minimap: { enabled: false },
						lineNumbers: "on",
						scrollBeyondLastLine: false,
						automaticLayout: true,
						wordWrap: "off",
						fontSize: 13,
						renderWhitespace: "none",
						folding: true,
						glyphMargin: true,
						lineDecorationsWidth: 5,
						fixedOverflowWidgets: true,
					}}
				/>
			</div>
		</div>
	);
}
