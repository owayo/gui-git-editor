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
});
