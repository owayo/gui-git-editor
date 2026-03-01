import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "../types/errors";
import type { FileContent } from "../types/git";
import { useFileStore } from "./fileStore";

// IPC モジュールをモックする
vi.mock("../types/ipc", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	createBackup: vi.fn(),
	restoreBackup: vi.fn(),
}));

import * as ipc from "../types/ipc";

const mockedIpc = vi.mocked(ipc);

const makeFileContent = (
	overrides: Partial<FileContent> = {},
): FileContent => ({
	path: "/tmp/test.txt",
	content: "file content",
	file_type: "commit_msg",
	...overrides,
});

const makeAppError = (overrides: Partial<AppError> = {}): AppError => ({
	code: "IoError",
	details: { message: "something went wrong" },
	...overrides,
});

describe("fileStore", () => {
	beforeEach(() => {
		useFileStore.getState().reset();
		vi.clearAllMocks();
	});

	describe("initial state", () => {
		it("should have correct initial state", () => {
			const state = useFileStore.getState();
			expect(state.filePath).toBeNull();
			expect(state.fileType).toBeNull();
			expect(state.originalContent).toBeNull();
			expect(state.currentContent).toBeNull();
			expect(state.backupPath).toBeNull();
			expect(state.isLoading).toBe(false);
			expect(state.isSaving).toBe(false);
			expect(state.error).toBeNull();
			expect(state.isDirty).toBe(false);
		});
	});

	describe("loadFile", () => {
		it("should set isLoading to true and clear error while loading", async () => {
			let capturedState: { isLoading: boolean; error: AppError | null } | null =
				null;
			mockedIpc.readFile.mockImplementation(async () => {
				const state = useFileStore.getState();
				capturedState = {
					isLoading: state.isLoading,
					error: state.error,
				};
				return { ok: true, data: makeFileContent() };
			});

			await useFileStore.getState().loadFile("/tmp/test.txt");

			expect(capturedState).toEqual({
				isLoading: true,
				error: null,
			});
		});

		it("should load file successfully and update state", async () => {
			const fileData = makeFileContent({
				path: "/tmp/hello.txt",
				content: "hello world",
				file_type: "rebase_todo",
			});
			mockedIpc.readFile.mockResolvedValue({ ok: true, data: fileData });

			await useFileStore.getState().loadFile("/tmp/hello.txt");

			const state = useFileStore.getState();
			expect(state.filePath).toBe("/tmp/hello.txt");
			expect(state.fileType).toBe("rebase_todo");
			expect(state.originalContent).toBe("hello world");
			expect(state.currentContent).toBe("hello world");
			expect(state.isLoading).toBe(false);
			expect(state.isDirty).toBe(false);
			expect(state.error).toBeNull();
		});

		it("should clear stale backupPath when loading another file", async () => {
			mockedIpc.readFile.mockResolvedValue({
				ok: true,
				data: makeFileContent({
					path: "/tmp/next.txt",
					content: "next content",
				}),
			});

			useFileStore.setState({
				backupPath: "/tmp/old.txt.bak",
			});

			await useFileStore.getState().loadFile("/tmp/next.txt");

			expect(useFileStore.getState().backupPath).toBeNull();
		});

		it("should set error state on load failure", async () => {
			const error = makeAppError({
				code: "FileNotFound",
				details: { path: "/tmp/missing.txt" },
			});
			mockedIpc.readFile.mockResolvedValue({ ok: false, error });

			await useFileStore.getState().loadFile("/tmp/missing.txt");

			const state = useFileStore.getState();
			expect(state.error).toEqual(error);
			expect(state.isLoading).toBe(false);
			expect(state.filePath).toBeNull();
			expect(state.currentContent).toBeNull();
		});

		it("should clear previous error when loading a new file", async () => {
			useFileStore.setState({
				error: makeAppError(),
			});

			mockedIpc.readFile.mockResolvedValue({
				ok: true,
				data: makeFileContent(),
			});

			await useFileStore.getState().loadFile("/tmp/test.txt");

			expect(useFileStore.getState().error).toBeNull();
		});

		it("should call ipc.readFile with correct path", async () => {
			mockedIpc.readFile.mockResolvedValue({
				ok: true,
				data: makeFileContent(),
			});

			await useFileStore.getState().loadFile("/some/path.txt");

			expect(mockedIpc.readFile).toHaveBeenCalledWith("/some/path.txt");
			expect(mockedIpc.readFile).toHaveBeenCalledTimes(1);
		});
	});

	describe("saveFile", () => {
		it("should return false when filePath is null", async () => {
			useFileStore.setState({ filePath: null, currentContent: "content" });

			const result = await useFileStore.getState().saveFile();

			expect(result).toBe(false);
			expect(mockedIpc.writeFile).not.toHaveBeenCalled();
		});

		it("should return false when currentContent is null", async () => {
			useFileStore.setState({
				filePath: "/tmp/test.txt",
				currentContent: null,
			});

			const result = await useFileStore.getState().saveFile();

			expect(result).toBe(false);
			expect(mockedIpc.writeFile).not.toHaveBeenCalled();
		});

		it("should return false when both filePath and currentContent are null", async () => {
			const result = await useFileStore.getState().saveFile();

			expect(result).toBe(false);
			expect(mockedIpc.writeFile).not.toHaveBeenCalled();
		});

		it("should set isSaving to true and clear error while saving", async () => {
			let capturedState: { isSaving: boolean; error: AppError | null } | null =
				null;
			mockedIpc.writeFile.mockImplementation(async () => {
				const state = useFileStore.getState();
				capturedState = {
					isSaving: state.isSaving,
					error: state.error,
				};
				return { ok: true, data: undefined };
			});

			useFileStore.setState({
				filePath: "/tmp/test.txt",
				currentContent: "content",
			});

			await useFileStore.getState().saveFile();

			expect(capturedState).toEqual({
				isSaving: true,
				error: null,
			});
		});

		it("should save file successfully and update state", async () => {
			mockedIpc.writeFile.mockResolvedValue({ ok: true, data: undefined });

			useFileStore.setState({
				filePath: "/tmp/test.txt",
				originalContent: "old content",
				currentContent: "new content",
				isDirty: true,
			});

			const result = await useFileStore.getState().saveFile();

			expect(result).toBe(true);
			const state = useFileStore.getState();
			expect(state.originalContent).toBe("new content");
			expect(state.isSaving).toBe(false);
			expect(state.isDirty).toBe(false);
		});

		it("should call ipc.writeFile with correct arguments", async () => {
			mockedIpc.writeFile.mockResolvedValue({ ok: true, data: undefined });

			useFileStore.setState({
				filePath: "/tmp/output.txt",
				currentContent: "save this",
			});

			await useFileStore.getState().saveFile();

			expect(mockedIpc.writeFile).toHaveBeenCalledWith(
				"/tmp/output.txt",
				"save this",
			);
		});

		it("should set error state on save failure", async () => {
			const error = makeAppError({
				code: "PermissionDenied",
				details: { path: "/tmp/readonly.txt" },
			});
			mockedIpc.writeFile.mockResolvedValue({ ok: false, error });

			useFileStore.setState({
				filePath: "/tmp/readonly.txt",
				currentContent: "content",
				isDirty: true,
			});

			const result = await useFileStore.getState().saveFile();

			expect(result).toBe(false);
			const state = useFileStore.getState();
			expect(state.error).toEqual(error);
			expect(state.isSaving).toBe(false);
			expect(state.isDirty).toBe(true);
		});

		it("should save empty string content", async () => {
			mockedIpc.writeFile.mockResolvedValue({ ok: true, data: undefined });

			useFileStore.setState({
				filePath: "/tmp/empty.txt",
				currentContent: "",
			});

			const result = await useFileStore.getState().saveFile();

			expect(result).toBe(true);
			expect(mockedIpc.writeFile).toHaveBeenCalledWith("/tmp/empty.txt", "");
		});
	});

	describe("setContent", () => {
		it("should update currentContent", () => {
			useFileStore.getState().setContent("new content");

			expect(useFileStore.getState().currentContent).toBe("new content");
		});

		it("should set isDirty to true when content differs from original", () => {
			useFileStore.setState({ originalContent: "original" });

			useFileStore.getState().setContent("modified");

			expect(useFileStore.getState().isDirty).toBe(true);
		});

		it("should set isDirty to false when content matches original", () => {
			useFileStore.setState({
				originalContent: "same",
				isDirty: true,
			});

			useFileStore.getState().setContent("same");

			expect(useFileStore.getState().isDirty).toBe(false);
		});

		it("should set isDirty to true when originalContent is null and content is non-empty", () => {
			useFileStore.setState({ originalContent: null });

			useFileStore.getState().setContent("some content");

			expect(useFileStore.getState().isDirty).toBe(true);
		});

		it("should handle empty string content", () => {
			useFileStore.setState({ originalContent: "original" });

			useFileStore.getState().setContent("");

			expect(useFileStore.getState().currentContent).toBe("");
			expect(useFileStore.getState().isDirty).toBe(true);
		});

		it("should toggle isDirty correctly across multiple calls", () => {
			useFileStore.setState({ originalContent: "original" });

			useFileStore.getState().setContent("changed");
			expect(useFileStore.getState().isDirty).toBe(true);

			useFileStore.getState().setContent("original");
			expect(useFileStore.getState().isDirty).toBe(false);

			useFileStore.getState().setContent("changed again");
			expect(useFileStore.getState().isDirty).toBe(true);
		});
	});

	describe("createBackup", () => {
		it("should return false when filePath is null", async () => {
			const result = await useFileStore.getState().createBackup();

			expect(result).toBe(false);
			expect(mockedIpc.createBackup).not.toHaveBeenCalled();
		});

		it("should create backup successfully and store backupPath", async () => {
			mockedIpc.createBackup.mockResolvedValue({
				ok: true,
				data: "/tmp/test.txt.bak",
			});

			useFileStore.setState({ filePath: "/tmp/test.txt" });

			const result = await useFileStore.getState().createBackup();

			expect(result).toBe(true);
			expect(useFileStore.getState().backupPath).toBe("/tmp/test.txt.bak");
			expect(mockedIpc.createBackup).toHaveBeenCalledWith("/tmp/test.txt");
		});

		it("should set error on backup failure", async () => {
			const error = makeAppError();
			mockedIpc.createBackup.mockResolvedValue({ ok: false, error });

			useFileStore.setState({
				filePath: "/tmp/test.txt",
				backupPath: "/tmp/stale.txt.bak",
			});

			const result = await useFileStore.getState().createBackup();

			expect(result).toBe(false);
			expect(useFileStore.getState().error).toEqual(error);
			expect(useFileStore.getState().backupPath).toBeNull();
		});
	});

	describe("restoreBackup", () => {
		it("should return false when backupPath is null", async () => {
			useFileStore.setState({ filePath: "/tmp/test.txt", backupPath: null });

			const result = await useFileStore.getState().restoreBackup();

			expect(result).toBe(false);
			expect(mockedIpc.restoreBackup).not.toHaveBeenCalled();
		});

		it("should return false when filePath is null", async () => {
			useFileStore.setState({
				filePath: null,
				backupPath: "/tmp/test.txt.bak",
			});

			const result = await useFileStore.getState().restoreBackup();

			expect(result).toBe(false);
			expect(mockedIpc.restoreBackup).not.toHaveBeenCalled();
		});

		it("should restore backup and reload file on success", async () => {
			const restoredFile = makeFileContent({
				path: "/tmp/test.txt",
				content: "restored content",
			});

			mockedIpc.restoreBackup.mockResolvedValue({
				ok: true,
				data: undefined,
			});
			mockedIpc.readFile.mockResolvedValue({ ok: true, data: restoredFile });

			useFileStore.setState({
				filePath: "/tmp/test.txt",
				backupPath: "/tmp/test.txt.bak",
			});

			const result = await useFileStore.getState().restoreBackup();

			expect(result).toBe(true);
			expect(mockedIpc.restoreBackup).toHaveBeenCalledWith(
				"/tmp/test.txt.bak",
				"/tmp/test.txt",
			);
			expect(mockedIpc.readFile).toHaveBeenCalledWith("/tmp/test.txt");
			expect(useFileStore.getState().currentContent).toBe("restored content");
		});

		it("should set error on restore failure", async () => {
			const error = makeAppError();
			mockedIpc.restoreBackup.mockResolvedValue({ ok: false, error });

			useFileStore.setState({
				filePath: "/tmp/test.txt",
				backupPath: "/tmp/test.txt.bak",
			});

			const result = await useFileStore.getState().restoreBackup();

			expect(result).toBe(false);
			expect(useFileStore.getState().error).toEqual(error);
			expect(mockedIpc.readFile).not.toHaveBeenCalled();
		});
	});

	describe("clearError", () => {
		it("should clear the error state", () => {
			useFileStore.setState({ error: makeAppError() });

			useFileStore.getState().clearError();

			expect(useFileStore.getState().error).toBeNull();
		});

		it("should be no-op when error is already null", () => {
			useFileStore.getState().clearError();

			expect(useFileStore.getState().error).toBeNull();
		});
	});

	describe("reset", () => {
		it("should reset all state to initial values", () => {
			useFileStore.setState({
				filePath: "/tmp/test.txt",
				fileType: "commit_msg",
				originalContent: "original",
				currentContent: "modified",
				backupPath: "/tmp/test.txt.bak",
				isLoading: true,
				isSaving: true,
				error: makeAppError(),
				isDirty: true,
			});

			useFileStore.getState().reset();

			const state = useFileStore.getState();
			expect(state.filePath).toBeNull();
			expect(state.fileType).toBeNull();
			expect(state.originalContent).toBeNull();
			expect(state.currentContent).toBeNull();
			expect(state.backupPath).toBeNull();
			expect(state.isLoading).toBe(false);
			expect(state.isSaving).toBe(false);
			expect(state.error).toBeNull();
			expect(state.isDirty).toBe(false);
		});

		it("should be idempotent when already in initial state", () => {
			useFileStore.getState().reset();

			const state = useFileStore.getState();
			expect(state.filePath).toBeNull();
			expect(state.isDirty).toBe(false);
			expect(state.error).toBeNull();
		});
	});
});
