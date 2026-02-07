import { create } from "zustand";
import type { AppError } from "../types/errors";
import type { FileStatus } from "../types/git";
import * as ipc from "../types/ipc";

interface StagingState {
	// State
	staged: FileStatus[];
	unstaged: FileStatus[];
	untracked: FileStatus[];
	repoRoot: string | null;
	branchName: string | null;
	selectedFile: { path: string; staged: boolean } | null;
	diffContent: string | null;
	isLoadingStatus: boolean;
	isLoadingDiff: boolean;
	isOperating: boolean;
	error: AppError | null;

	// Actions
	fetchStatus: (filePath: string) => Promise<void>;
	stageFile: (filePath: string, target: string) => Promise<void>;
	unstageFile: (filePath: string, target: string) => Promise<void>;
	stageAll: (filePath: string) => Promise<void>;
	selectFile: (
		path: string,
		staged: boolean,
		filePath: string,
	) => Promise<void>;
	clearSelection: () => void;
	clearError: () => void;
	reset: () => void;
}

const initialState = {
	staged: [] as FileStatus[],
	unstaged: [] as FileStatus[],
	untracked: [] as FileStatus[],
	repoRoot: null as string | null,
	branchName: null as string | null,
	selectedFile: null as { path: string; staged: boolean } | null,
	diffContent: null as string | null,
	isLoadingStatus: false,
	isLoadingDiff: false,
	isOperating: false,
	error: null as AppError | null,
};

export const useStagingStore = create<StagingState>((set, get) => ({
	...initialState,

	fetchStatus: async (filePath: string) => {
		set({ isLoadingStatus: true, error: null });

		const result = await ipc.gitStatus(filePath);

		if (result.ok) {
			set({
				staged: result.data.staged,
				unstaged: result.data.unstaged,
				untracked: result.data.untracked,
				repoRoot: result.data.repoRoot,
				branchName: result.data.branchName,
				isLoadingStatus: false,
			});
		} else {
			set({ error: result.error, isLoadingStatus: false });
		}
	},

	stageFile: async (filePath: string, target: string) => {
		set({ isOperating: true, error: null });

		const result = await ipc.gitStageFile(filePath, target);

		if (result.ok) {
			set({ isOperating: false });
			await get().fetchStatus(filePath);
		} else {
			set({ error: result.error, isOperating: false });
		}
	},

	unstageFile: async (filePath: string, target: string) => {
		set({ isOperating: true, error: null });

		const result = await ipc.gitUnstageFile(filePath, target);

		if (result.ok) {
			set({ isOperating: false });
			await get().fetchStatus(filePath);
		} else {
			set({ error: result.error, isOperating: false });
		}
	},

	stageAll: async (filePath: string) => {
		set({ isOperating: true, error: null });

		const result = await ipc.gitStageAll(filePath);

		if (result.ok) {
			set({ isOperating: false });
			await get().fetchStatus(filePath);
		} else {
			set({ error: result.error, isOperating: false });
		}
	},

	selectFile: async (path: string, staged: boolean, filePath: string) => {
		set({ selectedFile: { path, staged }, isLoadingDiff: true });

		const result = await ipc.gitDiffFile(filePath, path, staged);

		if (result.ok) {
			set({ diffContent: result.data, isLoadingDiff: false });
		} else {
			set({ diffContent: null, isLoadingDiff: false });
		}
	},

	clearSelection: () => set({ selectedFile: null, diffContent: null }),

	clearError: () => set({ error: null }),

	reset: () => set(initialState),
}));
