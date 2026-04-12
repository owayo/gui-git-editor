import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackupRecoveryDialog } from "./BackupRecoveryDialog";

describe("BackupRecoveryDialog", () => {
	const onRestore = vi.fn();
	const onDiscard = vi.fn();

	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("ダイアログのタイトルと説明が表示される", () => {
		render(
			<BackupRecoveryDialog onRestore={onRestore} onDiscard={onDiscard} />,
		);

		expect(
			screen.getByText("バックアップが見つかりました"),
		).toBeInTheDocument();
		expect(
			screen.getByText(/前回のセッションで保存されていない変更があります/),
		).toBeInTheDocument();
	});

	it("復元ボタンと破棄ボタンが表示される", () => {
		render(
			<BackupRecoveryDialog onRestore={onRestore} onDiscard={onDiscard} />,
		);

		expect(
			screen.getByRole("button", { name: "バックアップから復元" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "バックアップを破棄" }),
		).toBeInTheDocument();
	});

	it("復元ボタンクリックで onRestore が呼ばれる", async () => {
		const user = userEvent.setup();
		render(
			<BackupRecoveryDialog onRestore={onRestore} onDiscard={onDiscard} />,
		);

		await user.click(
			screen.getByRole("button", { name: "バックアップから復元" }),
		);

		expect(onRestore).toHaveBeenCalledOnce();
	});

	it("破棄ボタンクリックで onDiscard が呼ばれる", async () => {
		const user = userEvent.setup();
		render(
			<BackupRecoveryDialog onRestore={onRestore} onDiscard={onDiscard} />,
		);

		await user.click(
			screen.getByRole("button", { name: "バックアップを破棄" }),
		);

		expect(onDiscard).toHaveBeenCalledOnce();
	});

	it("aria-modal='true' が設定されている", () => {
		render(
			<BackupRecoveryDialog onRestore={onRestore} onDiscard={onDiscard} />,
		);

		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveAttribute("aria-modal", "true");
	});

	it("aria-labelledby と aria-describedby が正しく設定されている", () => {
		render(
			<BackupRecoveryDialog onRestore={onRestore} onDiscard={onDiscard} />,
		);

		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveAttribute("aria-labelledby", "backup-dialog-title");
		expect(dialog).toHaveAttribute(
			"aria-describedby",
			"backup-dialog-description",
		);
	});

	it("マウント時に復元ボタンにフォーカスされる", () => {
		render(
			<BackupRecoveryDialog onRestore={onRestore} onDiscard={onDiscard} />,
		);

		const restoreButton = screen.getByRole("button", {
			name: "バックアップから復元",
		});
		expect(document.activeElement).toBe(restoreButton);
	});

	it("Tab キーでフォーカストラップが動作する（最後→最初）", async () => {
		const user = userEvent.setup();
		render(
			<BackupRecoveryDialog onRestore={onRestore} onDiscard={onDiscard} />,
		);

		const discardButton = screen.getByRole("button", {
			name: "バックアップを破棄",
		});
		const restoreButton = screen.getByRole("button", {
			name: "バックアップから復元",
		});

		// 復元ボタン（初期フォーカス）→ 破棄ボタン → Tab → 復元ボタンに戻る
		await user.tab();
		expect(document.activeElement).toBe(discardButton);

		// 破棄が最後の要素なので Tab で最初に戻る
		// ただし BackupRecoveryDialog のフォーカストラップはボタン順に依存
		// ボタンの DOM 順: 破棄 → 復元 なので Tab は復元に行く
		await user.tab();
		expect(document.activeElement).toBe(restoreButton);
	});

	it("Escape キーでダイアログが閉じない（破壊的操作の安全ガード）", async () => {
		const user = userEvent.setup();
		render(
			<BackupRecoveryDialog onRestore={onRestore} onDiscard={onDiscard} />,
		);

		await user.keyboard("{Escape}");

		expect(onDiscard).not.toHaveBeenCalled();
		expect(onRestore).not.toHaveBeenCalled();
	});
});
