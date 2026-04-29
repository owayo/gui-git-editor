import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMergeStore } from "../../stores";
import { CodexResolveButton } from "./CodexResolveButton";

describe("CodexResolveButton", () => {
	beforeEach(() => {
		// 既定値を毎回リセットする
		useMergeStore.setState({
			codexAvailable: null,
			checkCodexAvailable: vi.fn().mockResolvedValue(undefined),
			openCodexResolve: vi.fn().mockResolvedValue(undefined),
			reloadMergedFile: vi.fn().mockResolvedValue(undefined),
		});
	});

	it("codexAvailable が null（判定中）の場合は何も描画しない", () => {
		useMergeStore.setState({ codexAvailable: null });
		const { container } = render(<CodexResolveButton />);
		expect(container).toBeEmptyDOMElement();
	});

	it("codex が利用不可ならボタンは無効化されガイダンス文言を表示する", () => {
		useMergeStore.setState({ codexAvailable: false });
		render(<CodexResolveButton />);

		const button = screen.getByRole("button", { name: /Codex で解決/ });
		expect(button).toBeDisabled();
		expect(button.getAttribute("title")).toMatch(/インストールされていません/);
	});

	it("利用可能ならボタンが有効でクリックすると openCodexResolve が呼ばれる", async () => {
		const user = userEvent.setup();
		const openCodexResolve = vi.fn().mockResolvedValue(undefined);
		useMergeStore.setState({ codexAvailable: true, openCodexResolve });

		render(<CodexResolveButton />);

		const button = screen.getByRole("button", { name: /Codex で解決/ });
		expect(button).not.toBeDisabled();

		await user.click(button);
		expect(openCodexResolve).toHaveBeenCalledOnce();
	});

	it("起動完了後に再読み込みボタンが表示され、クリックで reloadMergedFile が呼ばれる", async () => {
		const user = userEvent.setup();
		const openCodexResolve = vi.fn().mockResolvedValue(undefined);
		const reloadMergedFile = vi.fn().mockResolvedValue(undefined);
		useMergeStore.setState({
			codexAvailable: true,
			openCodexResolve,
			reloadMergedFile,
		});

		render(<CodexResolveButton />);

		// 起動前は再読み込みボタンが存在しない
		expect(
			screen.queryByRole("button", { name: /再読み込み/ }),
		).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /Codex で解決/ }));

		const reloadButton = await screen.findByRole("button", {
			name: /再読み込み/,
		});
		expect(reloadButton).toBeInTheDocument();

		await user.click(reloadButton);
		expect(reloadMergedFile).toHaveBeenCalledOnce();
	});

	it("マウント時に checkCodexAvailable が呼ばれる", () => {
		const checkCodexAvailable = vi.fn().mockResolvedValue(undefined);
		useMergeStore.setState({
			codexAvailable: true,
			checkCodexAvailable,
		});

		render(<CodexResolveButton />);
		expect(checkCodexAvailable).toHaveBeenCalledOnce();
	});
});
