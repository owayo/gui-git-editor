import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	restrictToParentElement,
	restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useCallback } from "react";
import type { RebaseCommandType, RebaseEntry } from "../../types/git";
import {
	findSquashTarget,
	hasSquashTargetBeforeIndex,
} from "../../utils/rebase";
import { RebaseEntryItem } from "./RebaseEntryItem";

interface RebaseEntryListProps {
	entries: RebaseEntry[];
	selectedEntryId: string | null;
	onSelectEntry: (id: string | null) => void;
	onReorder: (fromIndex: number, toIndex: number) => void;
	onCommandChange: (id: string, command: RebaseCommandType) => void;
}

export function RebaseEntryList({
	entries,
	selectedEntryId,
	onSelectEntry,
	onReorder,
	onCommandChange,
}: RebaseEntryListProps) {
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;

			if (over && active.id !== over.id) {
				const oldIndex = entries.findIndex((e) => e.id === active.id);
				const newIndex = entries.findIndex((e) => e.id === over.id);
				onReorder(oldIndex, newIndex);
			}
		},
		[entries, onReorder],
	);

	if (entries.length === 0) {
		return (
			<div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
				<p className="text-gray-500 dark:text-gray-400">エントリがありません</p>
			</div>
		);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={handleDragEnd}
			modifiers={[restrictToVerticalAxis, restrictToParentElement]}
		>
			<SortableContext
				items={entries.map((e) => e.id)}
				strategy={verticalListSortingStrategy}
			>
				<ul
					aria-label="Rebaseエントリ一覧"
					aria-live="polite"
					className="flex flex-col gap-2"
				>
					{/* 最古コミットの位置を示すガイド */}
					<li
						aria-hidden="true"
						className="flex list-none items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
					>
						<span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
						<span>↑ 古いコミット（先に適用）</span>
						<span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
					</li>

					{entries.map((entry, index) => (
						<li key={entry.id} className="list-none">
							<RebaseEntryItem
								entry={entry}
								isSelected={entry.id === selectedEntryId}
								isFirst={index === 0}
								isLast={index === entries.length - 1}
								canSquashOrFixup={hasSquashTargetBeforeIndex(entries, index)}
								squashTarget={findSquashTarget(entries, index)}
								onSelect={() => onSelectEntry(entry.id)}
								onCommandChange={(cmd) => onCommandChange(entry.id, cmd)}
							/>
						</li>
					))}

					{/* 最新コミットの位置を示すガイド */}
					<li
						aria-hidden="true"
						className="flex list-none items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
					>
						<span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
						<span>↓ 新しいコミット（後に適用）</span>
						<span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
					</li>
				</ul>
				{/* ドラッグ操作の説明をスクリーンリーダー向けに提供する */}
				<div id="drag-instructions" className="sr-only">
					スペースキーでドラッグを開始し、矢印キーで移動、スペースキーでドロップします
				</div>
			</SortableContext>
		</DndContext>
	);
}
