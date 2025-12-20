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

/** Extract subject line only (first line, without leading #) */
function getSubject(message: string): string {
  const firstLine = message.split("\n")[0];
  return firstLine.replace(/^#\s*/, "");
}

interface RebaseEntryItemProps {
  entry: RebaseEntry;
  isSelected: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  /** Whether this entry can be set to squash/fixup (has valid target before it) */
  canSquashOrFixup?: boolean;
  /** The target commit for squash/fixup (the commit this will be merged into) */
  squashTarget?: RebaseEntry | null;
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
  canSquashOrFixup = true,
  squashTarget,
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

  // Build container classes based on command type and selection state
  // Command type: background tint (purple for squash/fixup, red for drop)
  // Selection: left border indicator + background highlight + slight lift
  const getContainerClasses = () => {
    const baseClasses =
      "group flex flex-col rounded-lg border p-3 transition-all";

    // Selection indicator - left border + background highlight
    const selectionClasses = isSelected
      ? "border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/20 -translate-y-0.5 shadow-sm"
      : "border-l-4 border-l-transparent";

    if (isDragging) {
      return `${baseClasses} z-50 border-blue-400 bg-blue-50 shadow-lg dark:border-blue-500 dark:bg-blue-900/30`;
    }

    if (isDropped) {
      return `${baseClasses} border-red-200 bg-red-50/50 opacity-60 dark:border-red-800 dark:bg-red-900/20 ${selectionClasses}`;
    }

    if (isSquashOrFixup) {
      return `${baseClasses} border-purple-200 bg-purple-50/50 dark:border-purple-700 dark:bg-purple-900/20 ${selectionClasses}`;
    }

    // Normal state (pick, reword, edit)
    return `${baseClasses} border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 ${selectionClasses}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={getContainerClasses()}
      onClick={onSelect}
    >
      {/* Main row */}
      <div className="flex flex-1 items-center gap-3">
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
          aria-label={`${getSubject(entry.message)}を移動`}
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
            disabledCommands={canSquashOrFixup ? [] : ["squash", "fixup"]}
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
          title={getSubject(entry.message)}
        >
          {getSubject(entry.message)}
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

      {/* Squash/fixup target indicator */}
      {isSquashOrFixup && squashTarget && (
        <div className="mt-1 flex items-center gap-1 pl-8 text-xs text-purple-600 dark:text-purple-400">
          <span>→</span>
          <span className="font-mono">
            {squashTarget.commit_hash.slice(0, 7)}
          </span>
          <span className="truncate text-purple-500 dark:text-purple-300">
            {getSubject(squashTarget.message)}
          </span>
          <span className="text-purple-400 dark:text-purple-500">に統合</span>
        </div>
      )}
    </div>
  );
}
