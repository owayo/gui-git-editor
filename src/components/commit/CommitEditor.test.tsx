import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCommitStore, useFileStore } from "../../stores";
import {
	checkGitScAvailable,
	generateCommitMessageFromStaged,
} from "../../types/ipc";
import { CommitEditor } from "./CommitEditor";

// IPC モック
vi.mock("../../types/ipc", async () => {
	const actual =
		await vi.importActual<typeof import("../../types/ipc")>("../../types/ipc");
	return {
		...actual,
		checkGitScAvailable: vi.fn().mockResolvedValue({ ok: true, data: false }),
		generateCommitMessageFromStaged: vi
			.fn()
			.mockResolvedValue({ ok: true, data: "" }),
	};
});

describe("CommitEditor", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkGitScAvailable).mockResolvedValue({ ok: true, data: false });
		vi.mocked(generateCommitMessageFromStaged).mockResolvedValue({
			ok: true,
			data: "",
		});

		// commitStore を初期状態にリセット
		useCommitStore.getState().reset();
		// filePath を未設定にして StagingArea を非表示にする
		useFileStore.setState({ filePath: null });
	});

	describe("AI 生成ボタンの表示制御", () => {
		it("git-sc が利用不可ならボタンは表示されない", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: false,
			});

			render(<CommitEditor />);

			// useEffect の非同期完了を待つ
			await waitFor(() => {
				expect(vi.mocked(checkGitScAvailable)).toHaveBeenCalled();
			});

			expect(
				screen.queryByRole("button", { name: "Commit subject のみを生成" }),
			).not.toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Description も生成" }),
			).not.toBeInTheDocument();
		});

		it("git-sc 確認が失敗した場合もボタンは表示されない", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: false,
				error: { code: "CommandError", details: { message: "not found" } },
			});

			render(<CommitEditor />);

			await waitFor(() => {
				expect(vi.mocked(checkGitScAvailable)).toHaveBeenCalled();
			});

			expect(
				screen.queryByRole("button", { name: "Commit subject のみを生成" }),
			).not.toBeInTheDocument();
		});

		it("git-sc が利用可能ならボタンが表示される", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});

			render(<CommitEditor />);

			expect(
				await screen.findByRole("button", {
					name: "Commit subject のみを生成",
				}),
			).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Description も生成" }),
			).toBeInTheDocument();
		});
	});

	describe("AI 生成（handleGenerateWithAI）", () => {
		it("生成成功（subject のみ）→ subject に反映し body は空", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});
			vi.mocked(generateCommitMessageFromStaged).mockResolvedValue({
				ok: true,
				data: "Generated subject",
			});
			const user = userEvent.setup();

			render(<CommitEditor />);

			const button = await screen.findByRole("button", {
				name: "Commit subject のみを生成",
			});
			await user.click(button);

			expect(generateCommitMessageFromStaged).toHaveBeenCalledWith(false);
			await waitFor(() => {
				expect(useCommitStore.getState().subject).toBe("Generated subject");
			});
			expect(useCommitStore.getState().body).toBe("");
		});

		it("生成成功（subject + body、空行で区切り）→ 正しく分割される", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});
			vi.mocked(generateCommitMessageFromStaged).mockResolvedValue({
				ok: true,
				data: "Subject line\n\nBody first paragraph\n\nBody second paragraph",
			});
			const user = userEvent.setup();

			render(<CommitEditor />);

			const button = await screen.findByRole("button", {
				name: "Description も生成",
			});
			await user.click(button);

			expect(generateCommitMessageFromStaged).toHaveBeenCalledWith(true);
			await waitFor(() => {
				expect(useCommitStore.getState().subject).toBe("Subject line");
			});
			// 最初の空行以降が body になる（複数段落を保持）
			expect(useCommitStore.getState().body).toBe(
				"Body first paragraph\n\nBody second paragraph",
			);
		});

		it("生成成功（空行なし）→ 全体が subject、body は空", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});
			vi.mocked(generateCommitMessageFromStaged).mockResolvedValue({
				ok: true,
				data: "Only subject line",
			});
			const user = userEvent.setup();

			render(<CommitEditor />);

			const button = await screen.findByRole("button", {
				name: "Commit subject のみを生成",
			});
			await user.click(button);

			await waitFor(() => {
				expect(useCommitStore.getState().subject).toBe("Only subject line");
			});
			expect(useCommitStore.getState().body).toBe("");
		});

		it("生成成功（空文字）→ subject も body も空", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});
			vi.mocked(generateCommitMessageFromStaged).mockResolvedValue({
				ok: true,
				data: "",
			});
			useCommitStore.setState({ subject: "Old", body: "Old body" });
			const user = userEvent.setup();

			render(<CommitEditor />);

			const button = await screen.findByRole("button", {
				name: "Commit subject のみを生成",
			});
			await user.click(button);

			await waitFor(() => {
				expect(useCommitStore.getState().subject).toBe("");
			});
			expect(useCommitStore.getState().body).toBe("");
		});

		it("生成エラー → エラーメッセージを表示し、既存の subject/body を保持する", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});
			vi.mocked(generateCommitMessageFromStaged).mockResolvedValue({
				ok: false,
				error: {
					code: "CommandError",
					details: { message: "git-sc failed" },
				},
			});
			useCommitStore.setState({
				subject: "Existing subject",
				body: "Existing body",
			});
			const user = userEvent.setup();

			render(<CommitEditor />);

			const button = await screen.findByRole("button", {
				name: "Commit subject のみを生成",
			});
			await user.click(button);

			expect(await screen.findByText(/git-sc failed/)).toBeInTheDocument();
			// 既存の入力は保持される
			expect(useCommitStore.getState().subject).toBe("Existing subject");
			expect(useCommitStore.getState().body).toBe("Existing body");
		});

		it("生成完了後はボタンの disabled が解除される", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});
			vi.mocked(generateCommitMessageFromStaged).mockResolvedValue({
				ok: true,
				data: "Done",
			});
			const user = userEvent.setup();

			render(<CommitEditor />);

			const button = await screen.findByRole("button", {
				name: "Commit subject のみを生成",
			});
			await user.click(button);

			// 生成完了後は subject が反映されボタンが再度操作可能になる
			await waitFor(() => {
				expect(useCommitStore.getState().subject).toBe("Done");
			});
			expect(
				screen.getByRole("button", { name: "Commit subject のみを生成" }),
			).not.toBeDisabled();
		});
	});

	describe("基本表示", () => {
		it("コミットメッセージのヘッダーと推奨文を表示する", () => {
			render(<CommitEditor />);

			expect(screen.getByText("コミットメッセージ")).toBeInTheDocument();
			expect(screen.getByText(/Subject は 50 文字以内/)).toBeInTheDocument();
		});

		it("filePath が null の場合は StagingArea を表示しない", () => {
			useFileStore.setState({ filePath: null });
			render(<CommitEditor />);

			// StagingArea は filePath が無い場合非表示
			expect(screen.queryByText(/Staged|Unstaged/)).not.toBeInTheDocument();
		});
	});
});
