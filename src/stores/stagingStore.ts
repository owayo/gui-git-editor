import { create } from "zustand";
import type { AppError } from "../types/errors";
import type { FileStatus } from "../types/git";
import * as ipc from "../types/ipc";

type SelectedDiffFile = {
	path: string;
	staged: boolean;
};

interface StagingState {
	// 状態
	staged: FileStatus[];
	unstaged: FileStatus[];
	untracked: FileStatus[];
	repoRoot: string | null;
	branchName: string | null;
	selectedFile: SelectedDiffFile | null;
	diffContent: string | null;
	isLoadingStatus: boolean;
	isLoadingDiff: boolean;
	isOperating: boolean;
	error: AppError | null;

	// 操作
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
	selectedFile: null as SelectedDiffFile | null,
	diffContent: null as string | null,
	isLoadingStatus: false,
	isLoadingDiff: false,
	isOperating: false,
	error: null as AppError | null,
};

const hasPath = (files: FileStatus[], path: string) =>
	files.some((file) => file.path === path);

const resolveSelectedFile = (
	selectedFile: SelectedDiffFile | null,
	staged: FileStatus[],
	unstaged: FileStatus[],
	untracked: FileStatus[],
): SelectedDiffFile | null => {
	if (!selectedFile) {
		return null;
	}

	const hasStagedPath = hasPath(staged, selectedFile.path);
	const hasUnstagedPath =
		hasPath(unstaged, selectedFile.path) ||
		hasPath(untracked, selectedFile.path);

	if (selectedFile.staged && hasStagedPath) {
		return { path: selectedFile.path, staged: true };
	}

	if (!selectedFile.staged && hasUnstagedPath) {
		return { path: selectedFile.path, staged: false };
	}

	if (hasStagedPath) {
		return { path: selectedFile.path, staged: true };
	}

	if (hasUnstagedPath) {
		return { path: selectedFile.path, staged: false };
	}

	return null;
};

const isSameSelectedFile = (
	left: SelectedDiffFile | null,
	right: SelectedDiffFile | null,
) => left?.path === right?.path && left?.staged === right?.staged;

export const useStagingStore = create<StagingState>((set, get) => {
	let statusRequestId = 0;
	let diffRequestId = 0;

	const loadDiffForSelection = async (
		filePath: string,
		selectedFile: SelectedDiffFile,
	) => {
		const requestId = ++diffRequestId;
		set({
			selectedFile,
			diffContent: null,
			isLoadingDiff: true,
		});

		const result = await ipc.gitDiffFile(
			filePath,
			selectedFile.path,
			selectedFile.staged,
		);
		const currentSelectedFile = get().selectedFile;

		if (
			requestId !== diffRequestId ||
			!currentSelectedFile ||
			!isSameSelectedFile(currentSelectedFile, selectedFile)
		) {
			return;
		}

		if (result.ok) {
			set({ diffContent: result.data, isLoadingDiff: false });
		} else {
			set({ diffContent: null, isLoadingDiff: false });
		}
	};

	return {
		...initialState,

		fetchStatus: async (filePath: string) => {
			const requestId = ++statusRequestId;
			set({ isLoadingStatus: true, error: null });

			const result = await ipc.gitStatus(filePath);

			if (requestId !== statusRequestId) {
				return;
			}

			if (result.ok) {
				const currentSelectedFile = get().selectedFile;
				const nextSelectedFile = resolveSelectedFile(
					currentSelectedFile,
					result.data.staged,
					result.data.unstaged,
					result.data.untracked,
				);
				if (!nextSelectedFile) {
					diffRequestId += 1;
				}

				set({
					staged: result.data.staged,
					unstaged: result.data.unstaged,
					untracked: result.data.untracked,
					repoRoot: result.data.repoRoot,
					branchName: result.data.branchName,
					selectedFile: nextSelectedFile,
					diffContent: null,
					isLoadingStatus: false,
					isLoadingDiff: Boolean(nextSelectedFile),
				});

				if (nextSelectedFile) {
					await loadDiffForSelection(filePath, nextSelectedFile);
				}
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
			await loadDiffForSelection(filePath, { path, staged });
		},

		clearSelection: () => {
			diffRequestId += 1;
			set({ selectedFile: null, diffContent: null, isLoadingDiff: false });
		},

		clearError: () => set({ error: null }),

		reset: () => {
			statusRequestId += 1;
			diffRequestId += 1;
			set(initialState);
		},
	};
});
