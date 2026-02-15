import { create } from "zustand";
import type { AppError } from "../types/errors";
import type { CommitFileInfo } from "../types/git";
import * as ipc from "../types/ipc";

interface CommitDiffState {
	// State
	commitHash: string | null;
	files: CommitFileInfo[];
	selectedFile: string | null;
	diffContent: string | null;
	isLoadingFiles: boolean;
	isLoadingDiff: boolean;
	error: AppError | null;

	// Actions
	fetchFiles: (filePath: string, commitHash: string) => Promise<void>;
	selectFile: (
		filePath: string,
		commitHash: string,
		targetFile: string,
	) => Promise<void>;
	reset: () => void;
}

const initialState = {
	commitHash: null as string | null,
	files: [] as CommitFileInfo[],
	selectedFile: null as string | null,
	diffContent: null as string | null,
	isLoadingFiles: false,
	isLoadingDiff: false,
	error: null as AppError | null,
};

export const useCommitDiffStore = create<CommitDiffState>((set) => ({
	...initialState,

	fetchFiles: async (filePath: string, commitHash: string) => {
		set({
			commitHash,
			files: [],
			selectedFile: null,
			diffContent: null,
			isLoadingFiles: true,
			error: null,
		});

		const result = await ipc.gitCommitFiles(filePath, commitHash);

		if (result.ok) {
			set({ files: result.data, isLoadingFiles: false });
		} else {
			set({ error: result.error, isLoadingFiles: false });
		}
	},

	selectFile: async (
		filePath: string,
		commitHash: string,
		targetFile: string,
	) => {
		set({ selectedFile: targetFile, isLoadingDiff: true });

		const result = await ipc.gitCommitDiff(filePath, commitHash, targetFile);

		if (result.ok) {
			set({ diffContent: result.data, isLoadingDiff: false });
		} else {
			set({ diffContent: null, isLoadingDiff: false });
		}
	},

	reset: () => set(initialState),
}));
