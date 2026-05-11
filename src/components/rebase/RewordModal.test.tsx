import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkGitScAvailable, generateCommitMessage } from "../../types/ipc";
import { RewordModal } from "./RewordModal";

// IPC モック
vi.mock("../../types/ipc", () => ({
	checkGitScAvailable: vi.fn().mockResolvedValue({ ok: true, data: false }),
	generateCommitMessage: vi.fn().mockResolvedValue({ ok: true, data: "" }),
}));

const defaultProps = {
	isOpen: true,
	commitHash: "abc1234def5678",
	initialMessage: "",
	onSave: vi.fn(),
	onCancel: vi.fn(),
};

describe("RewordModal", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(checkGitScAvailable).mockResolvedValue({ ok: true, data: false });
		vi.mocked(generateCommitMessage).mockResolvedValue({ ok: true, data: "" });
	});

	// =========================================
	// splitMessage テスト（コンポーネント動作経由）
	// =========================================
	describe("splitMessage（initialMessage の分割）", () => {
		it("subject のみ（空行なし）→ subject に全文、body は空", () => {
			render(<RewordModal {...defaultProps} initialMessage="Fix a bug" />);

			const subjectInput = screen.getByLabelText("Commit subject");
			const bodyTextarea = screen.getByLabelText("Description");

			expect(subjectInput).toHaveValue("Fix a bug");
			expect(bodyTextarea).toHaveValue("");
		});

		it("subject + body（空行で区切り）→ 正しく分割される", () => {
			render(
				<RewordModal
					{...defaultProps}
					initialMessage={"Add feature\n\nDetailed description here"}
				/>,
			);

			const subjectInput = screen.getByLabelText("Commit subject");
			const bodyTextarea = screen.getByLabelText("Description");

			expect(subjectInput).toHaveValue("Add feature");
			expect(bodyTextarea).toHaveValue("Detailed description here");
		});

		it("複数の空行がある場合 → 最初の空行で分割される", () => {
			render(
				<RewordModal
					{...defaultProps}
					initialMessage={"Subject line\n\nFirst paragraph\n\nSecond paragraph"}
				/>,
			);

			const subjectInput = screen.getByLabelText("Commit subject");
			const bodyTextarea = screen.getByLabelText("Description");

			expect(subjectInput).toHaveValue("Subject line");
			expect(bodyTextarea).toHaveValue("First paragraph\n\nSecond paragraph");
		});

		it("空メッセージ → 両フィールドとも空", () => {
			render(<RewordModal {...defaultProps} initialMessage="" />);

			const subjectInput = screen.getByLabelText("Commit subject");
			const bodyTextarea = screen.getByLabelText("Description");

			expect(subjectInput).toHaveValue("");
			expect(bodyTextarea).toHaveValue("");
		});
	});

	// =========================================
	// joinMessage テスト（保存動作経由）
	// =========================================
	describe("joinMessage（保存時のメッセージ結合）", () => {
		it("subject のみ → onSave に subject だけ渡される（末尾に空行なし）", async () => {
			const user = userEvent.setup();
			const onSave = vi.fn();

			render(
				<RewordModal {...defaultProps} onSave={onSave} initialMessage="" />,
			);

			const subjectInput = screen.getByLabelText("Commit subject");
			await user.type(subjectInput, "Only subject");

			const saveButton = screen.getByRole("button", { name: "保存" });
			await user.click(saveButton);

			expect(onSave).toHaveBeenCalledWith("Only subject");
		});

		it("subject + body → onSave に空行区切りで結合されたメッセージが渡される", async () => {
			const user = userEvent.setup();
			const onSave = vi.fn();

			render(
				<RewordModal {...defaultProps} onSave={onSave} initialMessage="" />,
			);

			const subjectInput = screen.getByLabelText("Commit subject");
			const bodyTextarea = screen.getByLabelText("Description");

			await user.type(subjectInput, "Subject");
			await user.type(bodyTextarea, "Body text");

			const saveButton = screen.getByRole("button", { name: "保存" });
			await user.click(saveButton);

			expect(onSave).toHaveBeenCalledWith("Subject\n\nBody text");
		});

		it("body が空白のみ → subject だけが渡される", async () => {
			const user = userEvent.setup();
			const onSave = vi.fn();

			render(
				<RewordModal {...defaultProps} onSave={onSave} initialMessage="" />,
			);

			const subjectInput = screen.getByLabelText("Commit subject");
			const bodyTextarea = screen.getByLabelText("Description");

			await user.type(subjectInput, "Subject only");
			await user.type(bodyTextarea, "   ");

			const saveButton = screen.getByRole("button", { name: "保存" });
			await user.click(saveButton);

			expect(onSave).toHaveBeenCalledWith("Subject only");
		});
	});

	// =========================================
	// キーボードショートカット
	// =========================================
	describe("キーボードショートカット", () => {
		it("Escape で onCancel が呼ばれる", async () => {
			const user = userEvent.setup();
			const onCancel = vi.fn();

			render(
				<RewordModal
					{...defaultProps}
					onCancel={onCancel}
					initialMessage="Test"
				/>,
			);

			await user.keyboard("{Escape}");

			expect(onCancel).toHaveBeenCalledTimes(1);
		});

		it("Cmd+Enter で subject が空でなければ onSave が呼ばれる", async () => {
			const user = userEvent.setup();
			const onSave = vi.fn();

			render(
				<RewordModal
					{...defaultProps}
					onSave={onSave}
					initialMessage={"Existing subject\n\nExisting body"}
				/>,
			);

			await user.keyboard("{Meta>}{Enter}{/Meta}");

			expect(onSave).toHaveBeenCalledWith("Existing subject\n\nExisting body");
		});

		it("Cmd+Enter で subject が空の場合は onSave が呼ばれない", async () => {
			const user = userEvent.setup();
			const onSave = vi.fn();

			render(
				<RewordModal {...defaultProps} onSave={onSave} initialMessage="" />,
			);

			await user.keyboard("{Meta>}{Enter}{/Meta}");

			expect(onSave).not.toHaveBeenCalled();
		});
	});

	// =========================================
	// Props の動作
	// =========================================
	describe("Props の動作", () => {
		it("initialMessage が subject と body フィールドに正しく反映される", () => {
			render(
				<RewordModal
					{...defaultProps}
					initialMessage={"Refactor module\n\nImprove readability"}
				/>,
			);

			expect(screen.getByLabelText("Commit subject")).toHaveValue(
				"Refactor module",
			);
			expect(screen.getByLabelText("Description")).toHaveValue(
				"Improve readability",
			);
		});

		it("閉じるボタンクリックで onCancel が呼ばれる", async () => {
			const user = userEvent.setup();
			const onCancel = vi.fn();

			render(
				<RewordModal
					{...defaultProps}
					onCancel={onCancel}
					initialMessage="Test"
				/>,
			);

			const closeButton = screen.getByRole("button", { name: "閉じる" });
			await user.click(closeButton);

			expect(onCancel).toHaveBeenCalledTimes(1);
		});

		it("isOpen が false の場合はモーダルが表示されない", () => {
			render(
				<RewordModal {...defaultProps} isOpen={false} initialMessage="Test" />,
			);

			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		});
	});

	describe("AI 生成", () => {
		it("git-sc が利用可能な場合は subject 生成結果を入力欄に反映する", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});
			vi.mocked(generateCommitMessage).mockResolvedValue({
				ok: true,
				data: "Generated subject",
			});
			const user = userEvent.setup();

			render(<RewordModal {...defaultProps} initialMessage="Old subject" />);

			const generateButton = await screen.findByRole("button", {
				name: "Commit subject のみを生成",
			});
			await user.click(generateButton);

			expect(generateCommitMessage).toHaveBeenCalledWith(
				["abc1234def5678"],
				false,
			);
			expect(screen.getByLabelText("Commit subject")).toHaveValue(
				"Generated subject",
			);
			expect(screen.getByLabelText("Description")).toHaveValue("");
		});

		it("関連コミットを含めて Description 付きメッセージを生成する", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});
			vi.mocked(generateCommitMessage).mockResolvedValue({
				ok: true,
				data: "Generated subject\n\nGenerated body",
			});
			const user = userEvent.setup();

			render(
				<RewordModal
					{...defaultProps}
					relatedHashes={["1111111", "2222222"]}
					initialMessage="Old subject"
				/>,
			);

			const generateButton = await screen.findByRole("button", {
				name: "Description も生成",
			});
			await user.click(generateButton);

			expect(generateCommitMessage).toHaveBeenCalledWith(
				["abc1234def5678", "1111111", "2222222"],
				true,
			);
			expect(screen.getByLabelText("Commit subject")).toHaveValue(
				"Generated subject",
			);
			expect(screen.getByLabelText("Description")).toHaveValue(
				"Generated body",
			);
		});

		it("生成に失敗した場合はエラーを表示して既存入力を保持する", async () => {
			vi.mocked(checkGitScAvailable).mockResolvedValue({
				ok: true,
				data: true,
			});
			vi.mocked(generateCommitMessage).mockResolvedValue({
				ok: false,
				error: {
					code: "CommandError",
					details: { message: "git-sc failed" },
				},
			});
			const user = userEvent.setup();

			render(
				<RewordModal {...defaultProps} initialMessage="Existing subject" />,
			);

			const generateButton = await screen.findByRole("button", {
				name: "Commit subject のみを生成",
			});
			await user.click(generateButton);

			expect(await screen.findByRole("alert")).toHaveTextContent(
				"Command error: git-sc failed",
			);
			expect(screen.getByLabelText("Commit subject")).toHaveValue(
				"Existing subject",
			);
		});
	});
});
