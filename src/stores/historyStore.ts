import { create } from "zustand";
import type { RebaseEntry } from "../types/git";

interface HistorySnapshot {
	entries: RebaseEntry[];
	timestamp: number;
}

interface HistoryState {
	// 状態。
	past: HistorySnapshot[];
	future: HistorySnapshot[];
	maxHistory: number;

	// 操作。
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

			// 履歴サイズを制限する。
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
		if (past.length <= 1) return null;

		const newPast = [...past];
		const snapshot = newPast.pop();
		if (!snapshot) return null;

		set((state) => ({
			past: newPast,
			future: [snapshot, ...state.future],
		}));

		// pop したものの 1 つ前の状態を返す。
		if (newPast.length > 0) {
			return newPast[newPast.length - 1].entries;
		}
		return null;
	},

	redo: () => {
		const { future } = get();
		if (future.length === 0) return null;

		const newFuture = [...future];
		const snapshot = newFuture.shift();
		if (!snapshot) return null;

		set((state) => ({
			past: [...state.past, snapshot],
			future: newFuture,
		}));

		return snapshot.entries;
	},

	canUndo: () => get().past.length > 1,

	canRedo: () => get().future.length > 0,

	clear: () => set({ past: [], future: [] }),
}));
