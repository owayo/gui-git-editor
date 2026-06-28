import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMergeStore } from "../../stores";
import type { ConflictRegion } from "../../types/git";
import * as ipc from "../../types/ipc";
import { MergeEditor } from "./MergeEditor";

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: vi.fn(() => ({
		setTitle: vi.fn(),
	})),
}));

vi.mock("./MonacoPanel", () => ({
	MonacoPanel: ({
		label,
		displayLabel,
		content,
	}: {
		label: string;
		displayLabel?: string;
		content: string;
	}) => (
		<section aria-label={displayLabel ?? label} data-testid={`panel-${label}`}>
			{content}
		</section>
	),
}));

function resetMergeStore() {
	useMergeStore.setState({
		localContent: null,
		remoteContent: null,
		baseContent: null,
		mergedContent: null,
		mergedPath: null,
		language: "plaintext",
		conflicts: [],
		currentConflictIndex: 0,
		allResolved: false,
		isLoading: false,
		isSaving: false,
		error: null,
		isDirty: false,
		localLabel: "LOCAL",
		remoteLabel: "REMOTE",
		codexAvailable: null,
		localBlame: null,
		remoteBlame: null,
		resolvedReplacements: {},
	});
}

describe("MergeEditor", () => {
	beforeEach(() => {
		resetMergeStore();
		vi.spyOn(ipc, "readMergeFiles").mockResolvedValue({
			ok: true,
			data: {
				local: { path: "/tmp/local", content: "" },
				remote: { path: "/tmp/remote", content: "remote\n" },
				base: null,
				merged: { path: "/tmp/merged", content: "merged\n" },
				language: "plaintext",
				localLabel: "LOCAL",
				remoteLabel: "REMOTE",
			},
		});
		vi.spyOn(ipc, "parseConflicts").mockResolvedValue({
			ok: true,
			data: {
				conflicts: [],
				hasConflicts: false,
				totalConflicts: 0,
			},
		});
		vi.spyOn(ipc, "gitBlameForMerge").mockResolvedValue({
			ok: true,
			data: [],
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetMergeStore();
	});

	it("LOCAL が空ファイルでも読み込み待ちに戻さず編集パネルを表示する", async () => {
		render(
			<MergeEditor
				filePaths={{
					local: "/tmp/local",
					remote: "/tmp/remote",
					base: null,
					merged: "/tmp/merged",
				}}
			/>,
		);

		expect(await screen.findByTestId("panel-LOCAL")).toBeInTheDocument();
		expect(screen.getByTestId("panel-REMOTE")).toHaveTextContent("remote");
		expect(screen.getByTestId("panel-MERGED")).toHaveTextContent("merged");
		expect(
			screen.queryByText("ファイルの読み込みを待っています..."),
		).not.toBeInTheDocument();
	});

	it("マージ対象ファイルのパスをヘッダーに表示する", async () => {
		render(
			<MergeEditor
				filePaths={{
					local: "/tmp/local",
					remote: "/tmp/remote",
					base: null,
					merged: "src/components/merge/MergeEditor.tsx",
				}}
			/>,
		);

		await screen.findByTestId("panel-MERGED");

		// title 属性に完全パス、本文にディレクトリとファイル名が表示される。
		const pathHeader = screen.getByTitle(
			"src/components/merge/MergeEditor.tsx",
		);
		expect(pathHeader).toHaveTextContent(
			"src/components/merge/MergeEditor.tsx",
		);
		expect(pathHeader).toHaveTextContent("MergeEditor.tsx");
	});

	it("ディレクトリを含まないファイル名のみのパスも表示する", async () => {
		render(
			<MergeEditor
				filePaths={{
					local: "/tmp/local",
					remote: "/tmp/remote",
					base: null,
					merged: "COMMIT_EDITMSG",
				}}
			/>,
		);

		await screen.findByTestId("panel-MERGED");

		const pathHeader = screen.getByTitle("COMMIT_EDITMSG");
		expect(pathHeader).toHaveTextContent("COMMIT_EDITMSG");
	});

	it("全コンフリクト解決後も解決済み行の「戻す」ボタンを表示する", async () => {
		render(
			<MergeEditor
				filePaths={{
					local: "/tmp/local",
					remote: "/tmp/remote",
					base: null,
					merged: "/tmp/merged",
				}}
			/>,
		);

		await screen.findByTestId("panel-MERGED");

		// 全コンフリクトが解決済みの状態をストアへ反映する
		const resolvedConflict: ConflictRegion = {
			id: 0,
			startLine: 0,
			localStartLine: 1,
			localEndLine: 2,
			baseStartLine: null,
			baseEndLine: null,
			remoteStartLine: 3,
			remoteEndLine: 4,
			endLine: 4,
			localContent: "A",
			baseContent: null,
			remoteContent: "B",
			resolved: true,
		};
		act(() => {
			useMergeStore.setState({
				conflicts: [resolvedConflict],
				allResolved: true,
			});
		});

		// 未解決が 0 件でも解決済み行の revert（戻す）操作が UI から到達可能であること
		expect(screen.getByRole("button", { name: "戻す" })).toBeInTheDocument();
		expect(screen.getByText("解決済み")).toBeInTheDocument();
	});
});
