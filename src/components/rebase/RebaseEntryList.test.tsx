import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RebaseEntry } from "../../types/git";
import { RebaseEntryList } from "./RebaseEntryList";

const ENTRIES: RebaseEntry[] = [
	{
		id: "entry-1",
		command: { type: "pick" },
		commit_hash: "1111111",
		message: "first commit",
	},
	{
		id: "entry-2",
		command: { type: "pick" },
		commit_hash: "2222222",
		message: "second commit",
	},
];

describe("RebaseEntryList", () => {
	it("セマンティックなリストとして描画する", () => {
		render(
			<RebaseEntryList
				entries={ENTRIES}
				selectedEntryId={null}
				onSelectEntry={vi.fn()}
				onReorder={vi.fn()}
				onCommandChange={vi.fn()}
			/>,
		);

		const list = screen.getByRole("list", { name: "Rebaseエントリ一覧" });
		const items = within(list).getAllByRole("listitem", { hidden: true });

		// 先頭/末尾インジケーター2件 + エントリ件数
		expect(items).toHaveLength(ENTRIES.length + 2);
	});

	it("行コンテナにフォーカス時は Enter で選択する", async () => {
		const user = userEvent.setup();
		const onSelectEntry = vi.fn();

		render(
			<RebaseEntryList
				entries={ENTRIES}
				selectedEntryId={null}
				onSelectEntry={onSelectEntry}
				onReorder={vi.fn()}
				onCommandChange={vi.fn()}
			/>,
		);

		const firstEntry = screen.getAllByRole("option")[0];
		firstEntry.focus();
		await user.keyboard("{Enter}");

		expect(onSelectEntry).toHaveBeenCalledTimes(1);
		expect(onSelectEntry).toHaveBeenCalledWith("entry-1");
	});

	it("内部コントロールで Enter 操作しても行選択は発火しない", async () => {
		const user = userEvent.setup();
		const onSelectEntry = vi.fn();

		render(
			<RebaseEntryList
				entries={ENTRIES}
				selectedEntryId={null}
				onSelectEntry={onSelectEntry}
				onReorder={vi.fn()}
				onCommandChange={vi.fn()}
			/>,
		);

		const dragHandle = screen.getByRole("button", {
			name: "first commitを移動",
		});
		dragHandle.focus();
		await user.keyboard("{Enter}");

		expect(onSelectEntry).not.toHaveBeenCalled();
	});

	it("エントリが空の場合は空状態のメッセージを表示する", () => {
		render(
			<RebaseEntryList
				entries={[]}
				selectedEntryId={null}
				onSelectEntry={vi.fn()}
				onReorder={vi.fn()}
				onCommandChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("エントリがありません")).toBeInTheDocument();
		expect(screen.queryByRole("list")).not.toBeInTheDocument();
	});

	it("古いコミット・新しいコミットのガイドテキストを表示する", () => {
		render(
			<RebaseEntryList
				entries={ENTRIES}
				selectedEntryId={null}
				onSelectEntry={vi.fn()}
				onReorder={vi.fn()}
				onCommandChange={vi.fn()}
			/>,
		);

		expect(screen.getByText("↑ 古いコミット（先に適用）")).toBeInTheDocument();
		expect(
			screen.getByText("↓ 新しいコミット（後に適用）"),
		).toBeInTheDocument();
	});

	it("selectedEntryId に一致するエントリが選択状態になる", () => {
		render(
			<RebaseEntryList
				entries={ENTRIES}
				selectedEntryId="entry-2"
				onSelectEntry={vi.fn()}
				onReorder={vi.fn()}
				onCommandChange={vi.fn()}
			/>,
		);

		const options = screen.getAllByRole("option");
		expect(options[0]).toHaveAttribute("aria-selected", "false");
		expect(options[1]).toHaveAttribute("aria-selected", "true");
	});

	it("スクリーンリーダー向けのドラッグ操作説明が存在する", () => {
		render(
			<RebaseEntryList
				entries={ENTRIES}
				selectedEntryId={null}
				onSelectEntry={vi.fn()}
				onReorder={vi.fn()}
				onCommandChange={vi.fn()}
			/>,
		);

		const instructions = document.getElementById("drag-instructions");
		expect(instructions).toBeInTheDocument();
		expect(instructions?.textContent).toContain("スペースキーでドラッグを開始");
	});

	it("コマンド変更時に onCommandChange が正しい引数で呼ばれる", async () => {
		const user = userEvent.setup();
		const onCommandChange = vi.fn();

		render(
			<RebaseEntryList
				entries={ENTRIES}
				selectedEntryId={null}
				onSelectEntry={vi.fn()}
				onReorder={vi.fn()}
				onCommandChange={onCommandChange}
			/>,
		);

		// HeadlessUI Listbox のボタンをクリックしてドロップダウンを開く
		const buttons = screen.getAllByRole("button", { name: /Pick/i });
		await user.click(buttons[0]);

		// オプションを選択する
		const rewordOption = await screen.findByRole("option", {
			name: /Reword/,
		});
		await user.click(rewordOption);

		expect(onCommandChange).toHaveBeenCalledWith("entry-1", {
			type: "reword",
		});
	});
});
