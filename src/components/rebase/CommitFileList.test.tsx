import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CommitFileInfo } from "../../types/git";
import { CommitFileList } from "./CommitFileList";

const makeFile = (overrides: Partial<CommitFileInfo> = {}): CommitFileInfo => ({
	path: "src/App.tsx",
	originalPath: null,
	status: "M",
	...overrides,
});

describe("CommitFileList", () => {
	it("変更ファイルがない場合のメッセージを表示する", () => {
		render(
			<CommitFileList files={[]} selectedFile={null} onSelectFile={vi.fn()} />,
		);

		expect(screen.getByText("変更ファイルなし")).toBeInTheDocument();
	});

	it("rename 元パスを表示し、クリックされたファイルを通知する", async () => {
		const user = userEvent.setup();
		const onSelectFile = vi.fn();

		render(
			<CommitFileList
				files={[
					makeFile({
						path: "src/new-name.ts",
						originalPath: "src/old-name.ts",
						status: "R",
					}),
				]}
				selectedFile="src/new-name.ts"
				onSelectFile={onSelectFile}
			/>,
		);

		expect(screen.getByText("R")).toBeInTheDocument();
		expect(screen.getByText("src/new-name.ts")).toBeInTheDocument();
		expect(screen.getByText(/src\/old-name\.ts/)).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /src\/new-name\.ts/ }));

		expect(onSelectFile).toHaveBeenCalledWith("src/new-name.ts");
	});
});
