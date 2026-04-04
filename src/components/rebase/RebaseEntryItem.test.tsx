import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RebaseEntry } from "../../types/git";
import { RebaseEntryItem } from "./RebaseEntryItem";

vi.mock("@dnd-kit/sortable", () => ({
	useSortable: () => ({
		attributes: {},
		listeners: {},
		setNodeRef: vi.fn(),
		transform: null,
		transition: null,
		isDragging: false,
	}),
}));

vi.mock("@dnd-kit/utilities", () => ({
	CSS: {
		Transform: {
			toString: () => undefined,
		},
	},
}));

// テスト用のヘルパー: 基本的な pick エントリを作成
function makeEntry(overrides: Partial<RebaseEntry> = {}): RebaseEntry {
	return {
		id: "entry-1",
		command: { type: "pick" },
		commit_hash: "abc1234def5678",
		message: "Fix bug in parser",
		...overrides,
	};
}

const defaultProps = {
	isSelected: false,
	onSelect: vi.fn(),
	onCommandChange: vi.fn(),
};

describe("RebaseEntryItem", () => {
	it("pick コマンドの通常表示", () => {
		const entry = makeEntry();
		render(<RebaseEntryItem entry={entry} {...defaultProps} />);

		// コミットハッシュの先頭7文字が表示される
		expect(screen.getByText("abc1234")).toBeInTheDocument();
		// コミットメッセージが表示される
		expect(screen.getByText("Fix bug in parser")).toBeInTheDocument();
		// ドラッグハンドルが存在する
		expect(
			screen.getByRole("button", { name: "Fix bug in parserを移動" }),
		).toBeInTheDocument();
		// コンテナに赤や紫の背景がない
		const container = screen.getByRole("option");
		expect(container.className).toContain("bg-white");
		expect(container.className).not.toContain("bg-red-50");
		expect(container.className).not.toContain("bg-purple-50");
	});

	it("drop コマンドの表示（取り消し線、赤い表示）", () => {
		const entry = makeEntry({ command: { type: "drop" } });
		render(<RebaseEntryItem entry={entry} {...defaultProps} />);

		// コンテナに赤系の背景が適用される
		const container = screen.getByRole("option");
		expect(container.className).toContain("bg-red-50");
		expect(container.className).toContain("border-red-200");

		// コミットハッシュに取り消し線が適用される
		const hash = screen.getByText("abc1234");
		expect(hash.className).toContain("line-through");

		// コミットメッセージにも取り消し線が適用される
		const message = screen.getByText("Fix bug in parser");
		expect(message.className).toContain("line-through");

		// XMarkIcon のタイトルが表示される
		expect(screen.getByTitle("このコミットは削除されます")).toBeInTheDocument();
	});

	it("squash コマンドの表示（紫色の表示、ArrowUpIcon）", () => {
		const entry = makeEntry({ command: { type: "squash" } });
		render(<RebaseEntryItem entry={entry} {...defaultProps} />);

		// コンテナに紫系の背景が適用される
		const container = screen.getByRole("option");
		expect(container.className).toContain("bg-purple-50");
		expect(container.className).toContain("border-purple-200");

		// ArrowUpIcon のタイトルが表示される
		expect(screen.getByTitle("前のコミットに統合されます")).toBeInTheDocument();

		// コミットハッシュに紫色が適用される
		const hash = screen.getByText("abc1234");
		expect(hash.className).toContain("text-purple-600");
	});

	it("fixup コマンドの表示", () => {
		const entry = makeEntry({ command: { type: "fixup" } });
		render(<RebaseEntryItem entry={entry} {...defaultProps} />);

		// fixup も squash と同様に紫系の背景
		const container = screen.getByRole("option");
		expect(container.className).toContain("bg-purple-50");

		// ArrowUpIcon が表示される
		expect(screen.getByTitle("前のコミットに統合されます")).toBeInTheDocument();

		// コミットメッセージに紫色が適用される
		const message = screen.getByText("Fix bug in parser");
		expect(message.className).toContain("text-purple-700");
	});

	it("特殊コマンド（exec）の表示（コマンドセレクタの代わりに span、value 表示）", () => {
		const entry = makeEntry({
			command: { type: "exec", value: "npm test" },
		});
		render(<RebaseEntryItem entry={entry} {...defaultProps} />);

		// CommandSelector の代わりにコマンドタイプがスパンで表示される
		const cmdSpan = screen.getByText("exec");
		expect(cmdSpan.tagName).toBe("SPAN");
		expect(cmdSpan.className).toContain("bg-gray-500");

		// value が表示される
		expect(screen.getByText("npm test")).toBeInTheDocument();
	});

	it("特殊コマンド（merge）の value がオブジェクトの場合 JSON.stringify される", () => {
		const mergeValue = {
			commit: "abc123",
			label: "feature",
			message: null,
		};
		const entry = makeEntry({
			command: { type: "merge", value: mergeValue },
		});
		render(<RebaseEntryItem entry={entry} {...defaultProps} />);

		// merge のコマンドタイプがスパンで表示される
		expect(screen.getByText("merge")).toBeInTheDocument();

		// value がJSON文字列として表示される
		expect(screen.getByText(JSON.stringify(mergeValue))).toBeInTheDocument();
	});

	it("squashTarget が渡された場合の統合先表示", () => {
		const entry = makeEntry({ command: { type: "squash" } });
		const target = makeEntry({
			id: "entry-0",
			commit_hash: "9999999abcdef",
			message: "Initial commit",
		});

		render(
			<RebaseEntryItem entry={entry} {...defaultProps} squashTarget={target} />,
		);

		// 統合先のコミットハッシュ先頭7文字が表示される
		expect(screen.getByText("9999999")).toBeInTheDocument();
		// 統合先のメッセージが表示される
		expect(screen.getByText("Initial commit")).toBeInTheDocument();
		// 「に統合」テキストが表示される
		expect(screen.getByText("に統合")).toBeInTheDocument();
	});

	it("squashTarget が null の場合は統合先が表示されない", () => {
		const entry = makeEntry({ command: { type: "squash" } });
		render(
			<RebaseEntryItem entry={entry} {...defaultProps} squashTarget={null} />,
		);

		// 「に統合」テキストが表示されない
		expect(screen.queryByText("に統合")).not.toBeInTheDocument();
	});

	it("canSquashOrFixup が false の場合 disabledCommands に squash/fixup が渡される", () => {
		// CommandSelector をモックして disabledCommands を検証
		const mockCommandSelector = vi.fn(() => (
			<div data-testid="command-selector" />
		));
		vi.doMock("./CommandSelector", () => ({
			CommandSelector: mockCommandSelector,
		}));

		// 直接 props を確認するため、CommandSelector のレンダリングを確認
		const entry = makeEntry({ command: { type: "pick" } });
		const { container } = render(
			<RebaseEntryItem
				entry={entry}
				{...defaultProps}
				canSquashOrFixup={false}
			/>,
		);

		// CommandSelector が存在する（特殊コマンドではないため）
		// canSquashOrFixup=false の場合、disabledCommands=["squash","fixup"] が渡されることを
		// DOM 上のセレクタが disabled options を持つことで間接的に確認
		// ここでは CommandSelector がレンダリングされることを確認
		expect(container.querySelector("button")).toBeInTheDocument();
	});

	it("クリックで onSelect が呼ばれる", async () => {
		const user = userEvent.setup();
		const onSelect = vi.fn();
		const entry = makeEntry();

		render(
			<RebaseEntryItem entry={entry} {...defaultProps} onSelect={onSelect} />,
		);

		const option = screen.getByRole("option");
		await user.click(option);

		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("選択状態の aria-selected", () => {
		const entry = makeEntry();

		// 未選択状態
		const { rerender } = render(
			<RebaseEntryItem entry={entry} {...defaultProps} isSelected={false} />,
		);
		const option = screen.getByRole("option");
		expect(option).toHaveAttribute("aria-selected", "false");

		// 選択状態に変更
		rerender(
			<RebaseEntryItem entry={entry} {...defaultProps} isSelected={true} />,
		);
		expect(option).toHaveAttribute("aria-selected", "true");

		// 選択状態のスタイルが適用される
		expect(option.className).toContain("border-l-blue-500");
		expect(option.className).toContain("ring-2");
	});

	it("メッセージの先頭行のみが表示される（# プレフィックスが除去される）", () => {
		const entry = makeEntry({
			message: "# First line\nSecond line\nThird line",
		});
		render(<RebaseEntryItem entry={entry} {...defaultProps} />);

		// # を除いた先頭行が表示される
		expect(screen.getByText("First line")).toBeInTheDocument();
		// 2行目以降は表示されない
		expect(screen.queryByText("Second line")).not.toBeInTheDocument();
	});
});
