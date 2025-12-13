import { create } from "zustand";
import type {
  RebaseEntry,
  RebaseTodoFile,
  SimpleCommand,
  RebaseCommandType,
} from "../types/git";
import type { AppError } from "../types/errors";
import * as ipc from "../types/ipc";

interface RebaseState {
  // State
  entries: RebaseEntry[];
  comments: string[];
  selectedEntryId: string | null;
  isLoading: boolean;
  error: AppError | null;

  // Derived state helpers
  getEntry: (id: string) => RebaseEntry | undefined;
  getSelectedEntry: () => RebaseEntry | undefined;

  // Actions
  parseContent: (content: string) => Promise<boolean>;
  serialize: () => Promise<string | null>;
  setEntries: (entries: RebaseEntry[]) => void;
  updateEntryCommand: (id: string, command: RebaseCommandType) => void;
  updateEntryMessage: (id: string, message: string) => void;
  moveEntry: (fromIndex: number, toIndex: number) => void;
  selectEntry: (id: string | null) => void;
  setSimpleCommand: (id: string, command: SimpleCommand) => void;
  dropEntry: (id: string) => void;
  undropEntry: (id: string) => void;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  entries: [] as RebaseEntry[],
  comments: [] as string[],
  selectedEntryId: null as string | null,
  isLoading: false,
  error: null as AppError | null,
};

export const useRebaseStore = create<RebaseState>((set, get) => ({
  ...initialState,

  getEntry: (id: string) => get().entries.find((e) => e.id === id),

  getSelectedEntry: () => {
    const { entries, selectedEntryId } = get();
    return selectedEntryId
      ? entries.find((e) => e.id === selectedEntryId)
      : undefined;
  },

  parseContent: async (content: string) => {
    set({ isLoading: true, error: null });

    const result = await ipc.parseRebaseTodo(content);

    if (result.ok) {
      const file: RebaseTodoFile = result.data;
      set({
        entries: file.entries,
        comments: file.comments,
        isLoading: false,
      });
      return true;
    } else {
      set({
        error: result.error,
        isLoading: false,
      });
      return false;
    }
  },

  serialize: async () => {
    const { entries, comments } = get();
    const file: RebaseTodoFile = { entries, comments };

    const result = await ipc.serializeRebaseTodo(file);

    if (result.ok) {
      return result.data;
    } else {
      set({ error: result.error });
      return null;
    }
  },

  setEntries: (entries: RebaseEntry[]) => set({ entries }),

  updateEntryCommand: (id: string, command: RebaseCommandType) => {
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id ? { ...entry, command } : entry
      ),
    }));
  },

  updateEntryMessage: (id: string, message: string) => {
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id ? { ...entry, message } : entry
      ),
    }));
  },

  moveEntry: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const newEntries = [...state.entries];
      const [removed] = newEntries.splice(fromIndex, 1);
      newEntries.splice(toIndex, 0, removed);
      return { entries: newEntries };
    });
  },

  selectEntry: (id: string | null) => set({ selectedEntryId: id }),

  setSimpleCommand: (id: string, command: SimpleCommand) => {
    const commandType: RebaseCommandType = { type: command };
    get().updateEntryCommand(id, commandType);
  },

  dropEntry: (id: string) => {
    get().updateEntryCommand(id, { type: "drop" });
  },

  undropEntry: (id: string) => {
    get().updateEntryCommand(id, { type: "pick" });
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));
