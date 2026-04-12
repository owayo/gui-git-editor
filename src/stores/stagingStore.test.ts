import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStagingStore } from "./stagingStore";

// IPC モジュールをモック化する
vi.mock("../types/ipc", () => ({
	gitStatus: vi.fn(),
	gitStageFile: vi.fn(),
	gitUnstageFile: vi.fn(),
	gitStageAll: vi.fn(),
	gitDiffFile: vi.fn(),
}));

import * as ipc from "../types/ipc";

const mockedIpc = vi.mocked(ipc);

const filePath = "/tmp/test-repo/.git/COMMIT_EDITMSG";

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve;
	});
	return { promise, resolve };
}

const mockStatusResult = {
	staged: [
		{
			path: "src/main.ts",
			originalPath: null,
			indexStatus: "M",
			worktreeStatus: " ",
		},
	],
	unstaged: [
		{
			path: "src/utils.ts",
			originalPath: null,
			indexStatus: " ",
			worktreeStatus: "M",
		},
	],
	untracked: [
		{
			path: "new-file.txt",
			originalPath: null,
			indexStatus: "?",
			worktreeStatus: "?",
		},
	],
	repoRoot: "/tmp/test-repo",
	branchName: "main",
};

describe("stagingStore", () => {
	beforeEach(() => {
		useStagingStore.getState().reset();
		vi.clearAllMocks();
	});

	describe("initial state", () => {
		it("should have empty initial state", () => {
			const state = useStagingStore.getState();
			expect(state.staged).toEqual([]);
			expect(state.unstaged).toEqual([]);
			expect(state.untracked).toEqual([]);
			expect(state.repoRoot).toBeNull();
			expect(state.branchName).toBeNull();
			expect(state.selectedFile).toBeNull();
			expect(state.diffContent).toBeNull();
			expect(state.isLoadingStatus).toBe(false);
			expect(state.isLoadingDiff).toBe(false);
			expect(state.isOperating).toBe(false);
			expect(state.error).toBeNull();
		});
	});

	describe("fetchStatus", () => {
		it("should populate file lists on success", async () => {
			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: mockStatusResult,
			});

			await useStagingStore.getState().fetchStatus(filePath);

			const state = useStagingStore.getState();
			expect(state.staged).toEqual(mockStatusResult.staged);
			expect(state.unstaged).toEqual(mockStatusResult.unstaged);
			expect(state.untracked).toEqual(mockStatusResult.untracked);
			expect(state.repoRoot).toBe("/tmp/test-repo");
			expect(state.branchName).toBe("main");
			expect(state.isLoadingStatus).toBe(false);
			expect(state.error).toBeNull();
		});

		it("should set error on failure", async () => {
			mockedIpc.gitStatus.mockResolvedValue({
				ok: false,
				error: { message: "git status failed" } as never,
			});

			await useStagingStore.getState().fetchStatus(filePath);

			const state = useStagingStore.getState();
			expect(state.error).toBeTruthy();
			expect(state.isLoadingStatus).toBe(false);
			expect(state.isLoadingDiff).toBe(false);
			expect(state.staged).toEqual([]);
		});

		it("should set isLoadingStatus to true during execution", async () => {
			let capturedLoading = false;
			mockedIpc.gitStatus.mockImplementation(async () => {
				capturedLoading = useStagingStore.getState().isLoadingStatus;
				return { ok: true, data: mockStatusResult };
			});

			await useStagingStore.getState().fetchStatus(filePath);

			expect(capturedLoading).toBe(true);
			expect(useStagingStore.getState().isLoadingStatus).toBe(false);
		});

		it("should clear previous error before fetching", async () => {
			useStagingStore.setState({
				error: { message: "old error" } as never,
			});

			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: mockStatusResult,
			});

			await useStagingStore.getState().fetchStatus(filePath);

			expect(useStagingStore.getState().error).toBeNull();
		});

		it("should ignore stale status responses when a newer refresh finishes first", async () => {
			const first = createDeferred<Awaited<ReturnType<typeof ipc.gitStatus>>>();
			const second =
				createDeferred<Awaited<ReturnType<typeof ipc.gitStatus>>>();
			const newerStatus = {
				...mockStatusResult,
				staged: [
					{
						path: "src/new.ts",
						originalPath: null,
						indexStatus: "A",
						worktreeStatus: " ",
					},
				],
			};

			mockedIpc.gitStatus
				.mockImplementationOnce(() => first.promise)
				.mockImplementationOnce(() => second.promise);

			const firstRequest = useStagingStore.getState().fetchStatus(filePath);
			const secondRequest = useStagingStore.getState().fetchStatus(filePath);

			second.resolve({
				ok: true,
				data: newerStatus,
			});
			await secondRequest;

			first.resolve({
				ok: true,
				data: mockStatusResult,
			});
			await firstRequest;

			const state = useStagingStore.getState();
			expect(state.staged).toEqual(newerStatus.staged);
			expect(state.unstaged).toEqual(newerStatus.unstaged);
			expect(state.untracked).toEqual(newerStatus.untracked);
		});

		it("should keep the selected side when the same path exists in staged and unstaged lists", async () => {
			const mixedPath = "src/shared.ts";
			useStagingStore.setState({
				selectedFile: { path: mixedPath, staged: false },
				diffContent: "existing diff",
			});
			mockedIpc.gitDiffFile.mockResolvedValue({
				ok: true,
				data: "updated unstaged diff",
			});

			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: {
					...mockStatusResult,
					staged: [
						{
							path: mixedPath,
							originalPath: null,
							indexStatus: "M",
							worktreeStatus: " ",
						},
					],
					unstaged: [
						{
							path: mixedPath,
							originalPath: null,
							indexStatus: " ",
							worktreeStatus: "M",
						},
					],
				},
			});

			await useStagingStore.getState().fetchStatus(filePath);

			const state = useStagingStore.getState();
			expect(state.selectedFile).toEqual({ path: mixedPath, staged: false });
			expect(state.diffContent).toBe("updated unstaged diff");
			expect(mockedIpc.gitDiffFile).toHaveBeenCalledWith(
				filePath,
				mixedPath,
				false,
			);
		});

		it("should reload diff when the refreshed selection moves from unstaged to staged", async () => {
			useStagingStore.setState({
				selectedFile: { path: "src/utils.ts", staged: false },
				diffContent: "stale diff",
			});
			mockedIpc.gitDiffFile.mockResolvedValue({
				ok: true,
				data: "fresh staged diff",
			});
			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: {
					...mockStatusResult,
					staged: [
						{
							path: "src/utils.ts",
							originalPath: null,
							indexStatus: "M",
							worktreeStatus: " ",
						},
					],
					unstaged: [],
					untracked: [],
				},
			});

			await useStagingStore.getState().fetchStatus(filePath);

			const state = useStagingStore.getState();
			expect(state.selectedFile).toEqual({
				path: "src/utils.ts",
				staged: true,
			});
			expect(state.diffContent).toBe("fresh staged diff");
			expect(mockedIpc.gitDiffFile).toHaveBeenCalledWith(
				filePath,
				"src/utils.ts",
				true,
			);
		});
	});

	describe("stageFile", () => {
		it("should call gitStageFile and refetch status on success", async () => {
			mockedIpc.gitStageFile.mockResolvedValue({
				ok: true,
				data: undefined,
			});
			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: mockStatusResult,
			});

			await useStagingStore.getState().stageFile(filePath, "src/utils.ts");

			expect(mockedIpc.gitStageFile).toHaveBeenCalledWith(
				filePath,
				"src/utils.ts",
			);
			expect(mockedIpc.gitStatus).toHaveBeenCalledWith(filePath);
			expect(useStagingStore.getState().isOperating).toBe(false);
		});

		it("should set error and not refetch on failure", async () => {
			mockedIpc.gitStageFile.mockResolvedValue({
				ok: false,
				error: { message: "stage failed" } as never,
			});

			await useStagingStore.getState().stageFile(filePath, "src/utils.ts");

			expect(useStagingStore.getState().error).toBeTruthy();
			expect(useStagingStore.getState().isOperating).toBe(false);
			expect(mockedIpc.gitStatus).not.toHaveBeenCalled();
		});

		it("should set isOperating to true during execution", async () => {
			let capturedOperating = false;
			mockedIpc.gitStageFile.mockImplementation(async () => {
				capturedOperating = useStagingStore.getState().isOperating;
				return { ok: true, data: undefined };
			});
			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: mockStatusResult,
			});

			await useStagingStore.getState().stageFile(filePath, "src/utils.ts");

			expect(capturedOperating).toBe(true);
		});

		it("should clear previous error before staging", async () => {
			useStagingStore.setState({
				error: { message: "old error" } as never,
			});
			mockedIpc.gitStageFile.mockResolvedValue({
				ok: true,
				data: undefined,
			});
			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: mockStatusResult,
			});

			await useStagingStore.getState().stageFile(filePath, "src/utils.ts");

			expect(useStagingStore.getState().error).toBeNull();
		});
	});

	describe("unstageFile", () => {
		it("should call gitUnstageFile and refetch status on success", async () => {
			mockedIpc.gitUnstageFile.mockResolvedValue({
				ok: true,
				data: undefined,
			});
			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: mockStatusResult,
			});

			await useStagingStore.getState().unstageFile(filePath, "src/main.ts");

			expect(mockedIpc.gitUnstageFile).toHaveBeenCalledWith(
				filePath,
				"src/main.ts",
			);
			expect(mockedIpc.gitStatus).toHaveBeenCalledWith(filePath);
			expect(useStagingStore.getState().isOperating).toBe(false);
		});

		it("should set error and not refetch on failure", async () => {
			mockedIpc.gitUnstageFile.mockResolvedValue({
				ok: false,
				error: { message: "unstage failed" } as never,
			});

			await useStagingStore.getState().unstageFile(filePath, "src/main.ts");

			expect(useStagingStore.getState().error).toBeTruthy();
			expect(useStagingStore.getState().isOperating).toBe(false);
			expect(mockedIpc.gitStatus).not.toHaveBeenCalled();
		});

		it("should set isOperating to true during execution", async () => {
			let capturedOperating = false;
			mockedIpc.gitUnstageFile.mockImplementation(async () => {
				capturedOperating = useStagingStore.getState().isOperating;
				return { ok: true, data: undefined };
			});
			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: mockStatusResult,
			});

			await useStagingStore.getState().unstageFile(filePath, "src/main.ts");

			expect(capturedOperating).toBe(true);
		});
	});

	describe("stageAll", () => {
		it("should call gitStageAll and refetch status on success", async () => {
			mockedIpc.gitStageAll.mockResolvedValue({
				ok: true,
				data: undefined,
			});
			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: mockStatusResult,
			});

			await useStagingStore.getState().stageAll(filePath);

			expect(mockedIpc.gitStageAll).toHaveBeenCalledWith(filePath);
			expect(mockedIpc.gitStatus).toHaveBeenCalledWith(filePath);
			expect(useStagingStore.getState().isOperating).toBe(false);
		});

		it("should set error and not refetch on failure", async () => {
			mockedIpc.gitStageAll.mockResolvedValue({
				ok: false,
				error: { message: "stage all failed" } as never,
			});

			await useStagingStore.getState().stageAll(filePath);

			expect(useStagingStore.getState().error).toBeTruthy();
			expect(useStagingStore.getState().isOperating).toBe(false);
			expect(mockedIpc.gitStatus).not.toHaveBeenCalled();
		});

		it("should set isOperating to true during execution", async () => {
			let capturedOperating = false;
			mockedIpc.gitStageAll.mockImplementation(async () => {
				capturedOperating = useStagingStore.getState().isOperating;
				return { ok: true, data: undefined };
			});
			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: mockStatusResult,
			});

			await useStagingStore.getState().stageAll(filePath);

			expect(capturedOperating).toBe(true);
		});
	});

	describe("selectFile", () => {
		it("should set selectedFile and fetch diff on success", async () => {
			mockedIpc.gitDiffFile.mockResolvedValue({
				ok: true,
				data: "diff --git a/src/main.ts b/src/main.ts\n+added line",
			});

			await useStagingStore
				.getState()
				.selectFile("src/main.ts", true, filePath);

			const state = useStagingStore.getState();
			expect(state.selectedFile).toEqual({
				path: "src/main.ts",
				staged: true,
			});
			expect(state.diffContent).toBe(
				"diff --git a/src/main.ts b/src/main.ts\n+added line",
			);
			expect(state.isLoadingDiff).toBe(false);
		});

		it("should pass staged flag correctly to gitDiffFile", async () => {
			mockedIpc.gitDiffFile.mockResolvedValue({
				ok: true,
				data: "diff content",
			});

			await useStagingStore
				.getState()
				.selectFile("src/utils.ts", false, filePath);

			expect(mockedIpc.gitDiffFile).toHaveBeenCalledWith(
				filePath,
				"src/utils.ts",
				false,
			);
		});

		it("should set diffContent to null on failure", async () => {
			mockedIpc.gitDiffFile.mockResolvedValue({
				ok: false,
				error: { message: "diff failed" } as never,
			});

			await useStagingStore
				.getState()
				.selectFile("src/main.ts", true, filePath);

			const state = useStagingStore.getState();
			expect(state.selectedFile).toEqual({
				path: "src/main.ts",
				staged: true,
			});
			expect(state.diffContent).toBeNull();
			expect(state.isLoadingDiff).toBe(false);
		});

		it("should set isLoadingDiff to true during execution", async () => {
			let capturedLoading = false;
			mockedIpc.gitDiffFile.mockImplementation(async () => {
				capturedLoading = useStagingStore.getState().isLoadingDiff;
				return { ok: true, data: "diff content" };
			});

			await useStagingStore
				.getState()
				.selectFile("src/main.ts", true, filePath);

			expect(capturedLoading).toBe(true);
			expect(useStagingStore.getState().isLoadingDiff).toBe(false);
		});

		it("should update selectedFile immediately before diff completes", async () => {
			let capturedSelectedFile: { path: string; staged: boolean } | null = null;
			mockedIpc.gitDiffFile.mockImplementation(async () => {
				capturedSelectedFile = useStagingStore.getState().selectedFile;
				return { ok: true, data: "diff content" };
			});

			await useStagingStore
				.getState()
				.selectFile("src/main.ts", true, filePath);

			expect(capturedSelectedFile).toEqual({
				path: "src/main.ts",
				staged: true,
			});
		});

		it("should ignore stale diff responses after selecting another file", async () => {
			const first =
				createDeferred<Awaited<ReturnType<typeof ipc.gitDiffFile>>>();
			const second =
				createDeferred<Awaited<ReturnType<typeof ipc.gitDiffFile>>>();

			mockedIpc.gitDiffFile
				.mockImplementationOnce(() => first.promise)
				.mockImplementationOnce(() => second.promise);

			const firstRequest = useStagingStore
				.getState()
				.selectFile("src/first.ts", true, filePath);
			const secondRequest = useStagingStore
				.getState()
				.selectFile("src/second.ts", false, filePath);

			second.resolve({
				ok: true,
				data: "diff --git a/src/second.ts",
			});
			await secondRequest;

			first.resolve({
				ok: true,
				data: "diff --git a/src/first.ts",
			});
			await firstRequest;

			const state = useStagingStore.getState();
			expect(state.selectedFile).toEqual({
				path: "src/second.ts",
				staged: false,
			});
			expect(state.diffContent).toBe("diff --git a/src/second.ts");
			expect(state.isLoadingDiff).toBe(false);
		});
	});

	describe("clearSelection", () => {
		it("should reset selectedFile and diffContent simultaneously", () => {
			useStagingStore.setState({
				selectedFile: { path: "src/main.ts", staged: true },
				diffContent: "some diff",
			});

			useStagingStore.getState().clearSelection();

			const state = useStagingStore.getState();
			expect(state.selectedFile).toBeNull();
			expect(state.diffContent).toBeNull();
		});

		it("should be a no-op when already cleared", () => {
			useStagingStore.getState().clearSelection();

			const state = useStagingStore.getState();
			expect(state.selectedFile).toBeNull();
			expect(state.diffContent).toBeNull();
		});
	});

	describe("clearError", () => {
		it("should clear the error state", () => {
			useStagingStore.setState({
				error: { message: "some error" } as never,
			});

			useStagingStore.getState().clearError();

			expect(useStagingStore.getState().error).toBeNull();
		});
	});

	describe("reset", () => {
		it("should reset all state to initial values", () => {
			useStagingStore.setState({
				staged: mockStatusResult.staged,
				unstaged: mockStatusResult.unstaged,
				untracked: mockStatusResult.untracked,
				repoRoot: "/tmp/test-repo",
				branchName: "main",
				selectedFile: { path: "src/main.ts", staged: true },
				diffContent: "some diff",
				isLoadingStatus: true,
				isLoadingDiff: true,
				isOperating: true,
				error: { message: "some error" } as never,
			});

			useStagingStore.getState().reset();

			const state = useStagingStore.getState();
			expect(state.staged).toEqual([]);
			expect(state.unstaged).toEqual([]);
			expect(state.untracked).toEqual([]);
			expect(state.repoRoot).toBeNull();
			expect(state.branchName).toBeNull();
			expect(state.selectedFile).toBeNull();
			expect(state.diffContent).toBeNull();
			expect(state.isLoadingStatus).toBe(false);
			expect(state.isLoadingDiff).toBe(false);
			expect(state.isOperating).toBe(false);
			expect(state.error).toBeNull();
		});
	});

	describe("isOperating flag on error", () => {
		it("should reset isOperating when stageFile fails", async () => {
			mockedIpc.gitStageFile.mockResolvedValue({
				ok: false,
				error: { message: "stage failed" } as never,
			});

			await useStagingStore.getState().stageFile(filePath, "file.ts");

			expect(useStagingStore.getState().isOperating).toBe(false);
		});

		it("should reset isOperating when unstageFile fails", async () => {
			mockedIpc.gitUnstageFile.mockResolvedValue({
				ok: false,
				error: { message: "unstage failed" } as never,
			});

			await useStagingStore.getState().unstageFile(filePath, "file.ts");

			expect(useStagingStore.getState().isOperating).toBe(false);
		});

		it("should reset isOperating when stageAll fails", async () => {
			mockedIpc.gitStageAll.mockResolvedValue({
				ok: false,
				error: { message: "stage all failed" } as never,
			});

			await useStagingStore.getState().stageAll(filePath);

			expect(useStagingStore.getState().isOperating).toBe(false);
		});
	});

	describe("resolveSelectedFile fallback", () => {
		it("選択中ファイルが staged だが staged リストから消えた場合は unstaged にフォールバックする", async () => {
			useStagingStore.setState({
				selectedFile: { path: "src/main.ts", staged: true },
				diffContent: "old diff",
			});
			mockedIpc.gitDiffFile.mockResolvedValue({
				ok: true,
				data: "unstaged diff",
			});

			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: {
					...mockStatusResult,
					staged: [],
					unstaged: [
						{
							path: "src/main.ts",
							originalPath: null,
							indexStatus: " ",
							worktreeStatus: "M",
						},
					],
					untracked: [],
					repoRoot: "/tmp/test-repo",
					branchName: "main",
				},
			});

			await useStagingStore.getState().fetchStatus(filePath);

			const state = useStagingStore.getState();
			expect(state.selectedFile).toEqual({
				path: "src/main.ts",
				staged: false,
			});
			expect(state.diffContent).toBe("unstaged diff");
		});

		it("選択中ファイルがどのリストにも存在しない場合は null にリセットする", async () => {
			useStagingStore.setState({
				selectedFile: { path: "deleted-file.ts", staged: true },
				diffContent: "old diff",
			});

			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: {
					...mockStatusResult,
					staged: [],
					unstaged: [],
					untracked: [],
					repoRoot: "/tmp/test-repo",
					branchName: "main",
				},
			});

			await useStagingStore.getState().fetchStatus(filePath);

			const state = useStagingStore.getState();
			expect(state.selectedFile).toBeNull();
			expect(state.diffContent).toBeNull();
		});

		it("選択中ファイルが unstaged だが untracked に移動した場合も維持する", async () => {
			useStagingStore.setState({
				selectedFile: { path: "new-file.txt", staged: false },
				diffContent: "old diff",
			});
			mockedIpc.gitDiffFile.mockResolvedValue({
				ok: true,
				data: "untracked diff",
			});

			mockedIpc.gitStatus.mockResolvedValue({
				ok: true,
				data: {
					...mockStatusResult,
					staged: [],
					unstaged: [],
					untracked: [
						{
							path: "new-file.txt",
							originalPath: null,
							indexStatus: "?",
							worktreeStatus: "?",
						},
					],
					repoRoot: "/tmp/test-repo",
					branchName: "main",
				},
			});

			await useStagingStore.getState().fetchStatus(filePath);

			const state = useStagingStore.getState();
			expect(state.selectedFile).toEqual({
				path: "new-file.txt",
				staged: false,
			});
		});
	});
});
