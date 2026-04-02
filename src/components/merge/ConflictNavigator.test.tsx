import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as MonacoEditor from "monaco-editor";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMergeStore } from "../../stores";
import type { ConflictRegion } from "../../types/git";
import { ConflictNavigator } from "./ConflictNavigator";

function makeConflict(id: number, resolved: boolean): ConflictRegion {
	return {
		id,
		startLine: id * 10,
		localStartLine: id * 10 + 1,
		localEndLine: id * 10 + 2,
		baseStartLine: null,
		baseEndLine: null,
		remoteStartLine: id * 10 + 3,
		remoteEndLine: id * 10 + 4,
		endLine: id * 10 + 4,
		localContent: "local",
		baseContent: null,
		remoteContent: "remote",
		resolved,
	};
}

function createMockEditorRef() {
	const revealLineInCenter = vi.fn();
	const ref = {
		current: {
			revealLineInCenter,
		} as unknown as MonacoEditor.editor.IStandaloneCodeEditor,
	};
	return { ref, revealLineInCenter };
}

describe("ConflictNavigator", () => {
	beforeEach(() => {
		useMergeStore.setState({
			conflicts: [],
			currentConflictIndex: 0,
			allResolved: false,
		});
	});

	it("currentConflictIndex より後ろに未解決がない場合は最後の位置を表示する", () => {
		useMergeStore.setState({
			conflicts: [makeConflict(0, false), makeConflict(1, true)],
			currentConflictIndex: 1,
			allResolved: false,
		});

		const editorRef =
			createRef<MonacoEditor.editor.IStandaloneCodeEditor | null>();
		render(<ConflictNavigator editorRef={editorRef} />);

		expect(screen.getByText("コンフリクト: 1/1")).toBeInTheDocument();
	});

	it("すべて解決済みの場合は解決済みメッセージを表示する", () => {
		useMergeStore.setState({
			conflicts: [makeConflict(0, true), makeConflict(1, true)],
			currentConflictIndex: 0,
			allResolved: true,
		});

		const editorRef =
			createRef<MonacoEditor.editor.IStandaloneCodeEditor | null>();
		render(<ConflictNavigator editorRef={editorRef} />);

		expect(
			screen.getByText("すべてのコンフリクトが解決済み"),
		).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("次ボタンをクリックするとエディタが該当行にスクロールする", async () => {
		const user = userEvent.setup();
		const { ref, revealLineInCenter } = createMockEditorRef();

		useMergeStore.setState({
			conflicts: [makeConflict(0, false), makeConflict(1, false)],
			currentConflictIndex: 0,
			allResolved: false,
		});

		render(<ConflictNavigator editorRef={ref} />);

		const nextButton = screen.getByRole("button", { name: /次/ });
		await user.click(nextButton);

		// startLine(10) + 1 = 11 でスクロール
		expect(revealLineInCenter).toHaveBeenCalledWith(11);
	});

	it("前ボタンをクリックするとエディタが該当行にスクロールする", async () => {
		const user = userEvent.setup();
		const { ref, revealLineInCenter } = createMockEditorRef();

		useMergeStore.setState({
			conflicts: [makeConflict(0, false), makeConflict(1, false)],
			currentConflictIndex: 1,
			allResolved: false,
		});

		render(<ConflictNavigator editorRef={ref} />);

		const prevButton = screen.getByRole("button", { name: /前/ });
		await user.click(prevButton);

		// startLine(0) + 1 = 1 でスクロール
		expect(revealLineInCenter).toHaveBeenCalledWith(1);
	});

	it("未解決コンフリクトが0件の場合はナビゲーションボタンが無効になる", () => {
		useMergeStore.setState({
			conflicts: [makeConflict(0, true)],
			currentConflictIndex: 0,
			allResolved: false,
		});

		const editorRef =
			createRef<MonacoEditor.editor.IStandaloneCodeEditor | null>();
		render(<ConflictNavigator editorRef={editorRef} />);

		expect(screen.getByText("コンフリクト: 0/0")).toBeInTheDocument();
		const buttons = screen.getAllByRole("button");
		for (const button of buttons) {
			expect(button).toBeDisabled();
		}
	});

	it("複数の未解決コンフリクトがある場合に正しい位置を表示する", () => {
		useMergeStore.setState({
			conflicts: [
				makeConflict(0, false),
				makeConflict(1, true),
				makeConflict(2, false),
			],
			currentConflictIndex: 0,
			allResolved: false,
		});

		const editorRef =
			createRef<MonacoEditor.editor.IStandaloneCodeEditor | null>();
		render(<ConflictNavigator editorRef={editorRef} />);

		expect(screen.getByText("コンフリクト: 1/2")).toBeInTheDocument();
	});

	it("editorRef.current が null の場合でもクラッシュしない", async () => {
		const user = userEvent.setup();

		useMergeStore.setState({
			conflicts: [makeConflict(0, false), makeConflict(1, false)],
			currentConflictIndex: 0,
			allResolved: false,
		});

		const editorRef = { current: null };
		render(<ConflictNavigator editorRef={editorRef} />);

		const nextButton = screen.getByRole("button", { name: /次/ });
		await user.click(nextButton);
		// クラッシュしなければOK
	});
});
