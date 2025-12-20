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

/**
 * Check if an entry can be squashed/fixup'd.
 * An entry can only be squash/fixup if there's a valid target commit before it
 * (i.e., a commit that is not drop).
 */
function canSquashOrFixup(entries: RebaseEntry[], index: number): boolean {
  // Check all entries before this one
  for (let i = 0; i < index; i++) {
    const entry = entries[i];
    // A valid target is any command that's not drop
    if (entry.command.type !== "drop") {
      return true;
    }
  }
  return false;
}

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
          {/* Oldest commit indicator */}
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
            <span>↑ 古いコミット（先に適用）</span>
            <span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
          </div>

          {entries.map((entry, index) => (
            <RebaseEntryItem
              key={entry.id}
              entry={entry}
              isSelected={entry.id === selectedEntryId}
              isFirst={index === 0}
              isLast={index === entries.length - 1}
              canSquashOrFixup={canSquashOrFixup(entries, index)}
              onSelect={() => onSelectEntry(entry.id)}
              onCommandChange={(cmd) => onCommandChange(entry.id, cmd)}
            />
          ))}

          {/* Newest commit indicator */}
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
            <span>↓ 新しいコミット（後に適用）</span>
            <span className="flex-1 border-t border-dashed border-gray-300 dark:border-gray-600" />
          </div>
        </div>
        {/* Screen reader instructions for drag and drop */}
        <div id="drag-instructions" className="sr-only">
          スペースキーでドラッグを開始し、矢印キーで移動、スペースキーでドロップします
        </div>
      </SortableContext>
    </DndContext>
  );
}
