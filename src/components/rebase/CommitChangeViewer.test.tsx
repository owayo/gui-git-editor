import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCommitDiffStore } from "../../stores";
import { CommitChangeViewer } from "./CommitChangeViewer";

const initialStoreState = useCommitDiffStore.getState();

describe("CommitChangeViewer", () => {
	beforeEach(() => {
		useCommitDiffStore.setState(initialStoreState, true);
		vi.clearAllMocks();
	});

	it("マウント時とコミット変更時に対象コミットのファイル一覧を取得する", () => {
		const fetchFiles = vi.fn();
		useCommitDiffStore.setState({ fetchFiles });

		const { rerender } = render(
			<CommitChangeViewer
				commitHash="abcdef1234567890"
				message="最初のコミット"
				filePath="/repo/git-rebase-todo"
			/>,
		);

		expect(fetchFiles).toHaveBeenCalledWith(
			"/repo/git-rebase-todo",
			"abcdef1234567890",
		);
		expect(screen.getByText("abcdef1")).toBeInTheDocument();
		expect(screen.getByText("最初のコミット")).toBeInTheDocument();

		rerender(
			<CommitChangeViewer
				commitHash="1234567890abcdef"
				message="次のコミット"
				filePath="/repo/git-rebase-todo"
			/>,
		);

		expect(fetchFiles).toHaveBeenLastCalledWith(
			"/repo/git-rebase-todo",
			"1234567890abcdef",
		);
		expect(fetchFiles).toHaveBeenCalledTimes(2);
	});

	it("ファイル選択時に現在のコミットと対象パスで差分を取得する", async () => {
		const user = userEvent.setup();
		const fetchFiles = vi.fn();
		const selectFile = vi.fn();
		useCommitDiffStore.setState({
			fetchFiles,
			selectFile,
			files: [{ path: "src/App.tsx", originalPath: null, status: "M" }],
			isLoadingFiles: false,
			error: null,
		});

		render(
			<CommitChangeViewer
				commitHash="abcdef1234567890"
				message="表示対象"
				filePath="/repo/git-rebase-todo"
			/>,
		);

		await user.click(screen.getByRole("button", { name: /src\/App\.tsx/ }));

		expect(selectFile).toHaveBeenCalledWith(
			"/repo/git-rebase-todo",
			"abcdef1234567890",
			"src/App.tsx",
		);
	});

	it("一覧読み込み中と取得エラーをそれぞれ表示する", () => {
		const fetchFiles = vi.fn();
		useCommitDiffStore.setState({ fetchFiles, isLoadingFiles: true });

		const { rerender } = render(
			<CommitChangeViewer
				commitHash="abcdef1234567890"
				message="表示対象"
				filePath="/repo/git-rebase-todo"
			/>,
		);

		expect(screen.getByText("ファイル一覧を読み込み中...")).toBeInTheDocument();

		act(() => {
			useCommitDiffStore.setState({
				isLoadingFiles: false,
				error: {
					code: "CommandError",
					details: { message: "diff-tree に失敗しました" },
				},
			});
		});
		rerender(
			<CommitChangeViewer
				commitHash="abcdef1234567890"
				message="表示対象"
				filePath="/repo/git-rebase-todo"
			/>,
		);

		expect(
			screen.getByText("Command error: diff-tree に失敗しました"),
		).toBeInTheDocument();
	});
});
