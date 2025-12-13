import { create } from "zustand";
import type { RebaseEntry } from "../types/git";

interface HistorySnapshot {
  entries: RebaseEntry[];
  timestamp: number;
}

interface HistoryState {
  // State
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  maxHistory: number;

  // Actions
  pushSnapshot: (entries: RebaseEntry[]) => void;
  undo: () => RebaseEntry[] | null;
  redo: () => RebaseEntry[] | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

const MAX_HISTORY = 50;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  maxHistory: MAX_HISTORY,

  pushSnapshot: (entries: RebaseEntry[]) => {
    set((state) => {
      const snapshot: HistorySnapshot = {
        entries: JSON.parse(JSON.stringify(entries)),
        timestamp: Date.now(),
      };

      const newPast = [...state.past, snapshot];

      // Limit history size
      if (newPast.length > state.maxHistory) {
        newPast.shift();
      }

      return {
        past: newPast,
        future: [], // Clear future on new action
      };
    });
  },

  undo: () => {
    const { past } = get();
    if (past.length === 0) return null;

    const newPast = [...past];
    const snapshot = newPast.pop()!;

    set((state) => ({
      past: newPast,
      future: [snapshot, ...state.future],
    }));

    // Return the previous state (one before the popped one)
    if (newPast.length > 0) {
      return newPast[newPast.length - 1].entries;
    }
    return null;
  },

  redo: () => {
    const { future } = get();
    if (future.length === 0) return null;

    const newFuture = [...future];
    const snapshot = newFuture.shift()!;

    set((state) => ({
      past: [...state.past, snapshot],
      future: newFuture,
    }));

    return snapshot.entries;
  },

  canUndo: () => get().past.length > 0,

  canRedo: () => get().future.length > 0,

  clear: () => set({ past: [], future: [] }),
}));
