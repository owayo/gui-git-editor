import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMergeStore } from "../../stores";
import type { ConflictRegion } from "../../types/git";
import { ConflictActions } from "./ConflictActions";

function makeConflict(overrides: Partial<ConflictRegion> = {}): ConflictRegion {
	return {
		id: 0,
		startLine: 0,
		localStartLine: 1,
		localEndLine: 2,
		baseStartLine: null,
		baseEndLine: null,
		remoteStartLine: 3,
		remoteEndLine: 4,
		endLine: 4,
		localContent: "local",
		baseContent: null,
		remoteContent: "remote",
		resolved: false,
		...overrides,
	};
}

describe("ConflictActions", () => {
	beforeEach(() => {
		// 各テスト前にラベルをデフォルトに戻す
		useMergeStore.setState({
			localLabel: "LOCAL",
			remoteLabel: "REMOTE",
		});
	});

	it("未解決コンフリクトでは LOCAL / REMOTE / 両方ボタンが表示される", () => {
		render(<ConflictActions conflict={makeConflict()} />);

		expect(screen.getByRole("button", { name: "LOCAL" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "REMOTE" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "両方" })).toBeInTheDocument();
		expect(screen.queryByText("解決済み")).not.toBeInTheDocument();
	});

	it("ストアのブランチラベルがボタン文言として反映される", () => {
		useMergeStore.setState({
			localLabel: "feature/x",
			remoteLabel: "main",
		});

		render(<ConflictActions conflict={makeConflict()} />);

		expect(
			screen.getByRole("button", { name: "feature/x" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "main" })).toBeInTheDocument();
	});

	it("LOCAL ボタンクリックで acceptLocal がコンフリクト ID 付きで呼ばれる", async () => {
		const user = userEvent.setup();
		const acceptLocal = vi.fn();
		useMergeStore.setState({ acceptLocal });

		render(<ConflictActions conflict={makeConflict({ id: 5 })} />);
		await user.click(screen.getByRole("button", { name: "LOCAL" }));

		expect(acceptLocal).toHaveBeenCalledWith(5);
	});

	it("REMOTE ボタンクリックで acceptRemote がコンフリクト ID 付きで呼ばれる", async () => {
		const user = userEvent.setup();
		const acceptRemote = vi.fn();
		useMergeStore.setState({ acceptRemote });

		render(<ConflictActions conflict={makeConflict({ id: 7 })} />);
		await user.click(screen.getByRole("button", { name: "REMOTE" }));

		expect(acceptRemote).toHaveBeenCalledWith(7);
	});

	it("両方ボタンクリックで acceptBoth が呼ばれる", async () => {
		const user = userEvent.setup();
		const acceptBoth = vi.fn();
		useMergeStore.setState({ acceptBoth });

		render(<ConflictActions conflict={makeConflict({ id: 3 })} />);
		await user.click(screen.getByRole("button", { name: "両方" }));

		expect(acceptBoth).toHaveBeenCalledWith(3);
	});

	it("解決済みコンフリクトでは「解決済み」表示と戻すボタンを表示する", () => {
		render(<ConflictActions conflict={makeConflict({ resolved: true })} />);

		expect(screen.getByText("解決済み")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "戻す" })).toBeInTheDocument();
		// 解決済み時は採用ボタン群を出さない
		expect(
			screen.queryByRole("button", { name: "LOCAL" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "REMOTE" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "両方" }),
		).not.toBeInTheDocument();
	});

	it("戻すボタンクリックで revertConflict がコンフリクト ID 付きで呼ばれる", async () => {
		const user = userEvent.setup();
		const revertConflict = vi.fn();
		useMergeStore.setState({ revertConflict });

		render(
			<ConflictActions conflict={makeConflict({ id: 9, resolved: true })} />,
		);
		await user.click(screen.getByRole("button", { name: "戻す" }));

		expect(revertConflict).toHaveBeenCalledWith(9);
	});
});
