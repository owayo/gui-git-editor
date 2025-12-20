import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bars3Icon, XMarkIcon, ArrowUpIcon } from "@heroicons/react/24/outline";
import type {
  RebaseEntry,
  SimpleCommand,
  RebaseCommandType,
} from "../../types/git";
import { SIMPLE_COMMANDS } from "../../types/git";
import { CommandSelector } from "./CommandSelector";

/** Remove leading # from commit message if present */
function cleanMessage(message: string): string {
  return message.replace(/^#\s*/, "");
}

interface RebaseEntryItemProps {
  entry: RebaseEntry;
  isSelected: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onSelect: () => void;
  onCommandChange: (command: RebaseCommandType) => void;
}

function getSimpleCommand(command: RebaseCommandType): SimpleCommand | null {
  if (SIMPLE_COMMANDS.includes(command.type as SimpleCommand)) {
    return command.type as SimpleCommand;
  }
  return null;
}

export function RebaseEntryItem({
  entry,
  isSelected,
  onSelect,
  onCommandChange,
}: RebaseEntryItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const simpleCommand = getSimpleCommand(entry.command);
  const commandType = entry.command.type;
  const isDropped = commandType === "drop";
  const isSquashOrFixup = commandType === "squash" || commandType === "fixup";
  const isSpecialCommand = simpleCommand === null;

  // Build container classes based on command type
  const getContainerClasses = () => {
    const baseClasses =
      "group flex items-center gap-3 rounded-lg border p-3 transition-all";

    if (isDragging) {
      return `${baseClasses} z-50 border-blue-400 bg-blue-50 shadow-lg dark:border-blue-500 dark:bg-blue-900/30`;
    }

    if (isDropped) {
      return `${baseClasses} border-red-200 bg-red-50/50 opacity-60 dark:border-red-800 dark:bg-red-900/20`;
    }

    if (isSquashOrFixup) {
      return `${baseClasses} border-purple-200 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-900/20`;
    }

    if (isSelected) {
      return `${baseClasses} border-blue-300 bg-blue-50/50 dark:border-blue-600 dark:bg-blue-900/20`;
    }

    return `${baseClasses} border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600 dark:hover:bg-gray-750`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={getContainerClasses()}
      onClick={onSelect}
    >
      {/* Status indicator for squash/fixup */}
      {isSquashOrFixup && (
        <div className="flex items-center" title="前のコミットに統合されます">
          <ArrowUpIcon className="h-4 w-4 text-purple-500 dark:text-purple-400" />
        </div>
      )}

      {/* Status indicator for drop */}
      {isDropped && (
        <div className="flex items-center" title="このコミットは削除されます">
          <XMarkIcon className="h-4 w-4 text-red-500 dark:text-red-400" />
        </div>
      )}

      {/* Drag handle */}
      <button
        type="button"
        aria-label={`${cleanMessage(entry.message)}を移動`}
        className="cursor-grab touch-none rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 active:cursor-grabbing dark:hover:bg-gray-700 dark:hover:text-gray-300"
        {...attributes}
        {...listeners}
      >
        <Bars3Icon className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Command selector */}
      {simpleCommand ? (
        <CommandSelector
          value={simpleCommand}
          onChange={(cmd) => onCommandChange({ type: cmd })}
        />
      ) : (
        <span className="w-24 rounded-md bg-gray-500 px-3 py-1.5 text-center text-sm font-medium text-white">
          {commandType}
        </span>
      )}

      {/* Commit hash */}
      <span
        className={`font-mono text-sm ${
          isDropped
            ? "text-gray-400 line-through dark:text-gray-500"
            : isSquashOrFixup
              ? "text-purple-600 dark:text-purple-400"
              : "text-amber-600 dark:text-amber-400"
        }`}
      >
        {entry.commit_hash.slice(0, 7)}
      </span>

      {/* Commit message */}
      <span
        className={`flex-1 truncate text-sm ${
          isDropped
            ? "text-gray-400 line-through dark:text-gray-500"
            : isSquashOrFixup
              ? "text-purple-700 dark:text-purple-300"
              : "text-gray-700 dark:text-gray-300"
        }`}
        title={cleanMessage(entry.message)}
      >
        {cleanMessage(entry.message)}
      </span>

      {/* Special command value indicator */}
      {isSpecialCommand && "value" in entry.command && (
        <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
          {typeof entry.command.value === "string"
            ? entry.command.value
            : JSON.stringify(entry.command.value)}
        </span>
      )}
    </div>
  );
}
