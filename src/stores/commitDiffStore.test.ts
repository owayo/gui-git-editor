import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCommitDiffStore } from "./commitDiffStore";

// Mock IPC module
vi.mock("../types/ipc", () => ({
	gitCommitFiles: vi.fn(),
	gitCommitDiff: vi.fn(),
}));

import * as ipc from "../types/ipc";

const mockedIpc = vi.mocked(ipc);

describe("commitDiffStore", () => {
	beforeEach(() => {
		useCommitDiffStore.getState().reset();
		vi.clearAllMocks();
	});

	describe("initial state", () => {
		it("should have empty initial state", () => {
			const state = useCommitDiffStore.getState();
			expect(state.commitHash).toBeNull();
			expect(state.files).toEqual([]);
			expect(state.selectedFile).toBeNull();
			expect(state.diffContent).toBeNull();
			expect(state.isLoadingFiles).toBe(false);
			expect(state.isLoadingDiff).toBe(false);
			expect(state.error).toBeNull();
		});
	});

	describe("fetchFiles", () => {
		it("should fetch commit files successfully", async () => {
			const files = [
				{ path: "src/app.ts", originalPath: null, status: "M" },
				{ path: "src/utils.ts", originalPath: null, status: "A" },
			];
			mockedIpc.gitCommitFiles.mockResolvedValue({
				ok: true,
				data: files,
			});

			await useCommitDiffStore.getState().fetchFiles("/repo", "abc123");

			const state = useCommitDiffStore.getState();
			expect(state.commitHash).toBe("abc123");
			expect(state.files).toEqual(files);
			expect(state.isLoadingFiles).toBe(false);
			expect(state.error).toBeNull();
		});

		it("should handle fetch error", async () => {
			mockedIpc.gitCommitFiles.mockResolvedValue({
				ok: false,
				error: { message: "not found" } as never,
			});

			await useCommitDiffStore.getState().fetchFiles("/repo", "bad");

			const state = useCommitDiffStore.getState();
			expect(state.files).toEqual([]);
			expect(state.isLoadingFiles).toBe(false);
			expect(state.error).toBeTruthy();
		});

		it("should reset selection when fetching new files", async () => {
			useCommitDiffStore.setState({
				selectedFile: "old.ts",
				diffContent: "old diff",
			});
			mockedIpc.gitCommitFiles.mockResolvedValue({
				ok: true,
				data: [],
			});

			await useCommitDiffStore.getState().fetchFiles("/repo", "abc123");

			expect(useCommitDiffStore.getState().selectedFile).toBeNull();
			expect(useCommitDiffStore.getState().diffContent).toBeNull();
		});
	});

	describe("selectFile", () => {
		it("should fetch diff for selected file", async () => {
			mockedIpc.gitCommitDiff.mockResolvedValue({
				ok: true,
				data: "diff --git a/file.ts",
			});

			await useCommitDiffStore
				.getState()
				.selectFile("/repo", "abc123", "file.ts");

			const state = useCommitDiffStore.getState();
			expect(state.selectedFile).toBe("file.ts");
			expect(state.diffContent).toBe("diff --git a/file.ts");
			expect(state.isLoadingDiff).toBe(false);
		});

		it("should handle diff fetch error", async () => {
			mockedIpc.gitCommitDiff.mockResolvedValue({
				ok: false,
				error: { message: "diff failed" } as never,
			});

			await useCommitDiffStore
				.getState()
				.selectFile("/repo", "abc123", "file.ts");

			const state = useCommitDiffStore.getState();
			expect(state.selectedFile).toBe("file.ts");
			expect(state.diffContent).toBeNull();
			expect(state.isLoadingDiff).toBe(false);
		});
	});

	describe("reset", () => {
		it("should reset to initial state", () => {
			useCommitDiffStore.setState({
				commitHash: "abc",
				files: [{ path: "f.ts", originalPath: null, status: "M" }],
				selectedFile: "f.ts",
				diffContent: "diff",
				isLoadingFiles: true,
				isLoadingDiff: true,
			});
			useCommitDiffStore.getState().reset();

			const state = useCommitDiffStore.getState();
			expect(state.commitHash).toBeNull();
			expect(state.files).toEqual([]);
			expect(state.selectedFile).toBeNull();
			expect(state.diffContent).toBeNull();
			expect(state.isLoadingFiles).toBe(false);
			expect(state.isLoadingDiff).toBe(false);
		});
	});
});
