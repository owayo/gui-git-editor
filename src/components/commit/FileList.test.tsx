import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FileStatus } from "../../types/git";
import { FileList } from "./FileList";

const makeFile = (overrides: Partial<FileStatus> = {}): FileStatus => ({
	path: "src/App.tsx",
	originalPath: null,
	indexStatus: " ",
	worktreeStatus: "M",
	...overrides,
});

describe("FileList", () => {
	it("ファイルが空の場合は何も表示しない", () => {
		const { container } = render(
			<FileList
				title="未ステージ"
				files={[]}
				actionType="stage"
				selectedPath={null}
				disabled={false}
				onAction={vi.fn()}
				onSelect={vi.fn()}
			/>,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("折りたたみ時はファイル行を非表示にする", async () => {
		const user = userEvent.setup();
		render(
			<FileList
				title="未ステージ"
				files={[makeFile()]}
				actionType="stage"
				selectedPath={null}
				disabled={false}
				onAction={vi.fn()}
				onSelect={vi.fn()}
			/>,
		);

		expect(screen.getByText("未ステージ (1)")).toBeInTheDocument();
		expect(screen.getByText("src/App.tsx")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "未ステージ (1)" }));

		expect(screen.queryByText("src/App.tsx")).not.toBeInTheDocument();
	});

	it("未ステージ一覧では worktree status を表示し、選択とステージ操作を呼び出す", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		const onSelect = vi.fn();

		render(
			<FileList
				title="未ステージ"
				files={[
					makeFile({
						path: "src/renamed.ts",
						originalPath: "src/old.ts",
						worktreeStatus: "?",
					}),
				]}
				actionType="stage"
				selectedPath="src/renamed.ts"
				disabled={false}
				onAction={onAction}
				onSelect={onSelect}
			/>,
		);

		expect(screen.getByText("?")).toBeInTheDocument();
		expect(screen.getByText("src/renamed.ts")).toBeInTheDocument();
		expect(screen.getByText(/src\/old\.ts/)).toBeInTheDocument();

		await user.click(screen.getByText("src/renamed.ts"));
		await user.click(screen.getByTitle("ステージに追加"));

		expect(onSelect).toHaveBeenCalledWith("src/renamed.ts");
		expect(onAction).toHaveBeenCalledWith("src/renamed.ts");
	});

	it("ステージ済み一覧では index status を表示し、無効化された操作ボタンを表示する", () => {
		render(
			<FileList
				title="ステージ済み"
				files={[makeFile({ path: "src/staged.ts", indexStatus: "A" })]}
				actionType="unstage"
				selectedPath={null}
				disabled={true}
				onAction={vi.fn()}
				onSelect={vi.fn()}
			/>,
		);

		expect(screen.getByText("A")).toBeInTheDocument();
		expect(screen.getByTitle("ステージから除外")).toBeDisabled();
	});
});
