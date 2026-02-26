import { render, screen } from "@testing-library/react";
import type * as MonacoEditor from "monaco-editor";
import { createRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
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
});
