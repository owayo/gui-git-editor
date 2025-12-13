import { useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import type { RebaseEntry, RebaseCommandType } from "../../types/git";
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
    })
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
    [entries, onReorder]
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
        <div
          role="list"
          aria-label="Rebaseエントリ一覧"
          aria-live="polite"
          className="flex flex-col gap-2"
        >
          {entries.map((entry) => (
            <RebaseEntryItem
              key={entry.id}
              entry={entry}
              isSelected={entry.id === selectedEntryId}
              onSelect={() => onSelectEntry(entry.id)}
              onCommandChange={(cmd) => onCommandChange(entry.id, cmd)}
            />
          ))}
        </div>
        {/* Screen reader instructions for drag and drop */}
        <div id="drag-instructions" className="sr-only">
          スペースキーでドラッグを開始し、矢印キーで移動、スペースキーでドロップします
        </div>
      </SortableContext>
    </DndContext>
  );
}
