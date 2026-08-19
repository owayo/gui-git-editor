import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	centerY,
	dragVertically,
	installTestLayout,
	type TestLayout,
} from "../../test/dndLayout";
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

const THREE_ENTRIES: RebaseEntry[] = [
	...ENTRIES,
	{
		id: "entry-3",
		command: { type: "pick" },
		commit_hash: "3333333",
		message: "third commit",
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

		const listbox = screen.getByRole("listbox", {
			name: "Rebaseエントリ一覧",
		});
		expect(listbox).toBeInTheDocument();

		const options = within(listbox).getAllByRole("option");
		expect(options).toHaveLength(ENTRIES.length);
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

	// マウスでの D&D 並び替えのデグレ防止。
	// dnd-kit は containerNodeRect にドラッグ中ノードの parentElement の矩形を使うため、
	// 各行を wrapper 要素で包むと restrictToParentElement が transform を
	// 「その行自身の矩形」へクランプし、行が 1px も動かず onDragEnd の over が
	// active と同一になって並び替えが成立しなくなる。
	describe("ドラッグ&ドロップでの並び替え", () => {
		let layout: TestLayout | null = null;

		afterEach(() => {
			layout?.restore();
			layout = null;
		});

		function renderWithLayout(entries: RebaseEntry[], onReorder: () => void) {
			layout = installTestLayout();

			render(
				<RebaseEntryList
					entries={entries}
					selectedEntryId={null}
					onSelectEntry={vi.fn()}
					onReorder={onReorder}
					onCommandChange={vi.fn()}
				/>,
			);

			// jsdom はレイアウトを持たないため、行へ擬似的な矩形を割り当てる。
			return layout.stackVertically(screen.getAllByRole("option"));
		}

		it("下方向へドラッグすると onReorder が移動元と移動先で呼ばれる", () => {
			const onReorder = vi.fn();
			const rects = renderWithLayout(THREE_ENTRIES, onReorder);

			dragVertically(
				screen.getByRole("button", { name: "first commitを移動" }),
				{
					from: centerY(rects[0]),
					to: centerY(rects[2]),
				},
			);

			expect(onReorder).toHaveBeenCalledTimes(1);
			expect(onReorder).toHaveBeenCalledWith(0, 2);
		});

		it("上方向へドラッグすると onReorder が移動元と移動先で呼ばれる", () => {
			const onReorder = vi.fn();
			const rects = renderWithLayout(THREE_ENTRIES, onReorder);

			dragVertically(
				screen.getByRole("button", { name: "third commitを移動" }),
				{
					from: centerY(rects[2]),
					to: centerY(rects[0]),
				},
			);

			expect(onReorder).toHaveBeenCalledTimes(1);
			expect(onReorder).toHaveBeenCalledWith(2, 0);
		});

		it("隣の行までドラッグすると 1 つ分だけ移動する", () => {
			const onReorder = vi.fn();
			const rects = renderWithLayout(THREE_ENTRIES, onReorder);

			dragVertically(
				screen.getByRole("button", { name: "second commitを移動" }),
				{
					from: centerY(rects[1]),
					to: centerY(rects[2]),
				},
			);

			expect(onReorder).toHaveBeenCalledWith(1, 2);
		});

		it("同じ位置にドロップした場合は onReorder を呼ばない", () => {
			const onReorder = vi.fn();
			const rects = renderWithLayout(THREE_ENTRIES, onReorder);

			// 行の高さ (60px) の内側に留まるので移動先は自分自身のまま。
			dragVertically(
				screen.getByRole("button", { name: "first commitを移動" }),
				{
					from: centerY(rects[0]),
					to: centerY(rects[0]) + 12,
				},
			);

			expect(onReorder).not.toHaveBeenCalled();
		});

		it("ドラッグ開始距離 (8px) に満たない移動では並び替えない", () => {
			const onReorder = vi.fn();
			const rects = renderWithLayout(THREE_ENTRIES, onReorder);

			const handle = screen.getByRole("button", {
				name: "first commitを移動",
			});
			const from = centerY(rects[0]);
			fireEvent.pointerDown(handle, {
				isPrimary: true,
				button: 0,
				clientX: 0,
				clientY: from,
			});
			fireEvent.pointerMove(document, { clientX: 0, clientY: from + 4 });
			fireEvent.pointerUp(document, { clientX: 0, clientY: from + 4 });

			expect(onReorder).not.toHaveBeenCalled();
		});

		it("並び替え対象の行は一覧コンテナの直接の子である", () => {
			renderWithLayout(THREE_ENTRIES, vi.fn());

			const listbox = screen.getByRole("listbox", {
				name: "Rebaseエントリ一覧",
			});
			const options = screen.getAllByRole("option");

			// 1 行だけを包む wrapper があると restrictToParentElement が
			// その wrapper の矩形へクランプしてドラッグが無効化される。
			for (const option of options) {
				expect(option.parentElement).toBe(listbox);
			}
		});

		it("ドラッグ中に entries が差し替わった場合は onReorder を呼ばない", () => {
			const onReorder = vi.fn();
			layout = installTestLayout();

			const { rerender } = render(
				<RebaseEntryList
					entries={THREE_ENTRIES}
					selectedEntryId={null}
					onSelectEntry={vi.fn()}
					onReorder={onReorder}
					onCommandChange={vi.fn()}
				/>,
			);
			const rects = layout.stackVertically(screen.getAllByRole("option"));

			const handle = screen.getByRole("button", {
				name: "first commitを移動",
			});
			const from = centerY(rects[0]);
			const to = centerY(rects[2]);

			fireEvent.pointerDown(handle, {
				isPrimary: true,
				button: 0,
				clientX: 0,
				clientY: from,
			});
			fireEvent.pointerMove(document, { clientX: 0, clientY: from + 12 });
			fireEvent.pointerMove(document, { clientX: 0, clientY: to });

			// ドロップ前に一覧が別の ID 集合へ差し替わると findIndex が -1 を返す。
			// そのまま onReorder(-1, ...) を通すと並び順が壊れるため呼んではいけない。
			const replaced: RebaseEntry[] = THREE_ENTRIES.map((entry, index) => ({
				...entry,
				id: `replaced-${index + 1}`,
			}));
			rerender(
				<RebaseEntryList
					entries={replaced}
					selectedEntryId={null}
					onSelectEntry={vi.fn()}
					onReorder={onReorder}
					onCommandChange={vi.fn()}
				/>,
			);
			layout.stackVertically(screen.getAllByRole("option"));

			fireEvent.pointerUp(document, { clientX: 0, clientY: to });

			expect(onReorder).not.toHaveBeenCalled();
		});
	});
});
