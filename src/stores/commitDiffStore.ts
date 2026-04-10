import { create } from "zustand";
import type { AppError } from "../types/errors";
import type { CommitFileInfo } from "../types/git";
import * as ipc from "../types/ipc";

interface CommitDiffState {
	// 状態
	commitHash: string | null;
	files: CommitFileInfo[];
	selectedFile: string | null;
	diffContent: string | null;
	isLoadingFiles: boolean;
	isLoadingDiff: boolean;
	error: AppError | null;

	// 操作
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

export const useCommitDiffStore = create<CommitDiffState>((set, get) => {
	let filesRequestId = 0;
	let diffRequestId = 0;

	return {
		...initialState,

		fetchFiles: async (filePath: string, commitHash: string) => {
			const requestId = ++filesRequestId;
			diffRequestId += 1;

			set({
				commitHash,
				files: [],
				selectedFile: null,
				diffContent: null,
				isLoadingFiles: true,
				isLoadingDiff: false,
				error: null,
			});

			const result = await ipc.gitCommitFiles(filePath, commitHash);

			if (requestId !== filesRequestId || get().commitHash !== commitHash) {
				return;
			}

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
			const requestId = ++diffRequestId;
			set({
				selectedFile: targetFile,
				diffContent: null,
				isLoadingDiff: true,
				error: null,
			});

			const result = await ipc.gitCommitDiff(filePath, commitHash, targetFile);

			if (
				requestId !== diffRequestId ||
				get().selectedFile !== targetFile ||
				get().commitHash !== commitHash
			) {
				return;
			}

			if (result.ok) {
				set({ diffContent: result.data, isLoadingDiff: false, error: null });
			} else {
				set({ error: result.error, diffContent: null, isLoadingDiff: false });
			}
		},

		reset: () => {
			filesRequestId += 1;
			diffRequestId += 1;
			set(initialState);
		},
	};
});
