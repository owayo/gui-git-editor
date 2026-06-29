import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MonacoPanel } from "./MonacoPanel";

const monacoMockState = vi.hoisted(() => ({
	editor: {
		onDidScrollChange: vi.fn(),
	},
	lastProps: undefined as
		| {
				onChange?: (value: string | undefined) => void;
				onMount?: (editor: unknown, monaco: unknown) => void;
		  }
		| undefined,
	scrollHandler: undefined as
		| ((event: { scrollTop: number }) => void)
		| undefined,
}));

vi.mock("../../stores", () => ({
	useThemeStore: (selector: (state: { resolvedTheme: "dark" }) => unknown) =>
		selector({ resolvedTheme: "dark" }),
}));

vi.mock("@monaco-editor/react", async () => {
	const React = await vi.importActual<typeof import("react")>("react");

	return {
		default: (props: {
			theme: string;
			language: string;
			value: string;
			onChange?: (value: string | undefined) => void;
			onMount?: (editor: unknown, monaco: unknown) => void;
			options?: { readOnly?: boolean };
		}) => {
			monacoMockState.lastProps = props;

			React.useEffect(() => {
				props.onMount?.(monacoMockState.editor, {});
			}, [props.onMount]);

			return React.createElement("textarea", {
				"aria-label": `monaco-${props.language}`,
				"data-readonly": String(props.options?.readOnly ?? false),
				"data-theme": props.theme,
				onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
					props.onChange?.(event.currentTarget.value);
				},
				value: props.value,
			});
		},
	};
});

describe("MonacoPanel", () => {
	it("空文字の変更を onChange に渡し、undefined は無視する", () => {
		const onChange = vi.fn();
		render(
			<MonacoPanel
				label="MERGED"
				content="解決済み"
				language="typescript"
				onChange={onChange}
			/>,
		);

		const editor = screen.getByLabelText("monaco-typescript");
		expect(editor).toHaveAttribute("data-theme", "vs-dark");

		fireEvent.change(editor, { target: { value: "" } });
		expect(onChange).toHaveBeenCalledWith("");

		onChange.mockClear();
		monacoMockState.lastProps?.onChange?.(undefined);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("editorRef とスクロール変更通知を親へ渡す", () => {
		const onEditorReady = vi.fn();
		const onScrollChange = vi.fn();
		const editorRef = { current: null };
		monacoMockState.editor.onDidScrollChange.mockImplementation((handler) => {
			monacoMockState.scrollHandler = handler;
			return { dispose: vi.fn() };
		});

		render(
			<MonacoPanel
				label="LOCAL"
				displayLabel="main"
				content="line"
				language="rust"
				readOnly={true}
				editorRef={editorRef}
				onEditorReady={onEditorReady}
				onScrollChange={onScrollChange}
			/>,
		);

		expect(screen.getByText("main")).toBeInTheDocument();
		expect(screen.getByLabelText("monaco-rust")).toHaveAttribute(
			"data-readonly",
			"true",
		);
		expect(editorRef.current).toBe(monacoMockState.editor);
		expect(onEditorReady).toHaveBeenCalledOnce();

		monacoMockState.scrollHandler?.({ scrollTop: 128 });
		expect(onScrollChange).toHaveBeenCalledWith(128);
	});
});
