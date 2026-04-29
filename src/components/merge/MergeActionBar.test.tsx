import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMergeStore } from "../../stores";
import * as ipc from "../../types/ipc";
import { MergeActionBar } from "./MergeActionBar";

vi.mock("../../types/ipc", async () => {
	const actual =
		await vi.importActual<typeof import("../../types/ipc")>("../../types/ipc");
	return {
		...actual,
		exitApp: vi.fn().mockResolvedValue({ ok: true, data: null }),
	};
});

describe("MergeActionBar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useMergeStore.setState({
			allResolved: false,
			isDirty: false,
			isSaving: false,
			save: vi.fn().mockResolvedValue(true),
		});
	});

	it("未解決のコンフリクトがある場合に警告メッセージを表示する", () => {
		useMergeStore.setState({ allResolved: false });
		render(<MergeActionBar />);

		expect(
			screen.getByText("未解決のコンフリクトがあります"),
		).toBeInTheDocument();
	});

	it("未解決時は保存ボタンが無効化される", () => {
		useMergeStore.setState({ allResolved: false });
		render(<MergeActionBar />);

		const saveButton = screen.getByRole("button", { name: /保存して終了/ });
		expect(saveButton).toBeDisabled();
	});

	it("すべて解決済みかつ未保存変更がある場合は変更ありメッセージを表示する", () => {
		useMergeStore.setState({ allResolved: true, isDirty: true });
		render(<MergeActionBar />);

		expect(screen.getByText("未保存の変更があります")).toBeInTheDocument();
	});

	it("すべて解決済みなら保存ボタンが有効になる", () => {
		useMergeStore.setState({ allResolved: true, isDirty: true });
		render(<MergeActionBar />);

		const saveButton = screen.getByRole("button", { name: /保存して終了/ });
		expect(saveButton).not.toBeDisabled();
	});

	it("保存中は保存中メッセージと処理中ボタンを表示する", () => {
		useMergeStore.setState({ isSaving: true, allResolved: true });
		render(<MergeActionBar />);

		expect(screen.getByText("保存中...")).toBeInTheDocument();
		const button = screen.getByRole("button", { name: /処理中/ });
		expect(button).toBeDisabled();
		expect(button).toHaveAttribute("aria-busy", "true");
	});

	it("保存ボタンクリックで save が呼ばれ、成功時は exitApp(0) が実行される", async () => {
		const user = userEvent.setup();
		const save = vi.fn().mockResolvedValue(true);
		useMergeStore.setState({ allResolved: true, isDirty: true, save });

		render(<MergeActionBar />);
		await user.click(screen.getByRole("button", { name: /保存して終了/ }));

		expect(save).toHaveBeenCalledOnce();
		expect(ipc.exitApp).toHaveBeenCalledWith(0);
	});

	it("save が false を返した場合は exitApp が呼ばれない", async () => {
		const user = userEvent.setup();
		const save = vi.fn().mockResolvedValue(false);
		useMergeStore.setState({ allResolved: true, isDirty: true, save });

		render(<MergeActionBar />);
		await user.click(screen.getByRole("button", { name: /保存して終了/ }));

		expect(save).toHaveBeenCalledOnce();
		expect(ipc.exitApp).not.toHaveBeenCalled();
	});

	it("キャンセルボタンクリックで exitApp(1) が実行される", async () => {
		const user = userEvent.setup();

		render(<MergeActionBar />);
		await user.click(screen.getByRole("button", { name: "キャンセル" }));

		expect(ipc.exitApp).toHaveBeenCalledWith(1);
	});
});
