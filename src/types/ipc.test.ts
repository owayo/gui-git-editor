import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

// invoke をモックして、IPC呼び出しの引数キーがcamelCaseであることを検証する
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

import {
	checkBackupExists,
	checkCodexAvailable,
	checkGitScAvailable,
	createBackup,
	deleteBackup,
	exitApp,
	generateCommitMessage,
	generateCommitMessageFromStaged,
	gitBlameForMerge,
	gitCommitDiff,
	gitCommitFiles,
	gitDiffFile,
	gitStageAll,
	gitStageFile,
	gitStatus,
	gitUnstageFile,
	openCodexTerminal,
	parseCommitMsg,
	parseConflicts,
	parseRebaseTodo,
	readFile,
	readMergeFiles,
	restoreBackup,
	serializeCommitMsg,
	serializeRebaseTodo,
	validateCommitMsg,
	writeFile,
} from "./ipc";

describe("IPC引数キーのcamelCase検証", () => {
	beforeEach(() => {
		mockedInvoke.mockReset();
		mockedInvoke.mockResolvedValue(undefined as never);
	});

	it("restoreBackup はcamelCaseキーを渡す", async () => {
		await restoreBackup("/tmp/test.txt.backup", "/tmp/test.txt");

		expect(mockedInvoke).toHaveBeenCalledWith("restore_backup", {
			backupPath: "/tmp/test.txt.backup",
			targetPath: "/tmp/test.txt",
		});
	});

	it("gitStatus はcamelCaseキーを渡す", async () => {
		await gitStatus("/path/to/file");

		expect(mockedInvoke).toHaveBeenCalledWith("git_status", {
			filePath: "/path/to/file",
		});
	});

	it("gitStageFile はcamelCaseキーを渡す", async () => {
		await gitStageFile("/path/to/file", "target.ts");

		expect(mockedInvoke).toHaveBeenCalledWith("git_stage_file", {
			filePath: "/path/to/file",
			target: "target.ts",
		});
	});

	it("gitUnstageFile はcamelCaseキーを渡す", async () => {
		await gitUnstageFile("/path/to/file", "target.ts");

		expect(mockedInvoke).toHaveBeenCalledWith("git_unstage_file", {
			filePath: "/path/to/file",
			target: "target.ts",
		});
	});

	it("gitStageAll はcamelCaseキーを渡す", async () => {
		await gitStageAll("/path/to/file");

		expect(mockedInvoke).toHaveBeenCalledWith("git_stage_all", {
			filePath: "/path/to/file",
		});
	});

	it("gitDiffFile はcamelCaseキーを渡す", async () => {
		await gitDiffFile("/path/to/file", "target.ts", true);

		expect(mockedInvoke).toHaveBeenCalledWith("git_diff_file", {
			filePath: "/path/to/file",
			target: "target.ts",
			staged: true,
		});
	});

	it("gitCommitFiles はcamelCaseキーを渡す", async () => {
		await gitCommitFiles("/path/to/file", "abc1234");

		expect(mockedInvoke).toHaveBeenCalledWith("git_commit_files", {
			filePath: "/path/to/file",
			commitHash: "abc1234",
		});
	});

	it("gitCommitDiff はcamelCaseキーを渡す", async () => {
		await gitCommitDiff("/path/to/file", "abc1234", "src/main.ts");

		expect(mockedInvoke).toHaveBeenCalledWith("git_commit_diff", {
			filePath: "/path/to/file",
			commitHash: "abc1234",
			targetFile: "src/main.ts",
		});
	});

	it("gitBlameForMerge はcamelCaseキーを渡す", async () => {
		await gitBlameForMerge("/path/to/merged", "local");

		expect(mockedInvoke).toHaveBeenCalledWith("git_blame_for_merge", {
			mergedPath: "/path/to/merged",
			side: "local",
		});
	});

	it("openCodexTerminal はcamelCaseキーを渡す", async () => {
		await openCodexTerminal("/path/to/merged");

		expect(mockedInvoke).toHaveBeenCalledWith("open_codex_terminal", {
			mergedPath: "/path/to/merged",
		});
	});

	it("generateCommitMessage はcamelCaseキーを渡す", async () => {
		await generateCommitMessage(["abc1234"], true);

		expect(mockedInvoke).toHaveBeenCalledWith("generate_commit_message", {
			hashes: ["abc1234"],
			withBody: true,
		});
	});

	it("generateCommitMessageFromStaged はcamelCaseキーを渡す", async () => {
		await generateCommitMessageFromStaged(true);

		expect(mockedInvoke).toHaveBeenCalledWith(
			"generate_commit_message_from_staged",
			{
				withBody: true,
			},
		);
	});

	it("exitApp はcamelCaseキーを渡す", async () => {
		await exitApp(0);

		expect(mockedInvoke).toHaveBeenCalledWith("exit_app", { code: 0 });
	});

	it("parseRebaseTodo はcamelCaseキーを渡す", async () => {
		await parseRebaseTodo("pick abc123 some commit");

		expect(mockedInvoke).toHaveBeenCalledWith("parse_rebase_todo", {
			content: "pick abc123 some commit",
		});
	});

	it("serializeRebaseTodo はcamelCaseキーを渡す", async () => {
		const file = { entries: [], comments: [] };
		await serializeRebaseTodo(file as never);

		expect(mockedInvoke).toHaveBeenCalledWith("serialize_rebase_todo", {
			file,
		});
	});

	it("parseCommitMsg はcamelCaseキーを渡す", async () => {
		await parseCommitMsg("feat: add feature\n\nbody text");

		expect(mockedInvoke).toHaveBeenCalledWith("parse_commit_msg", {
			content: "feat: add feature\n\nbody text",
		});
	});

	it("serializeCommitMsg はcamelCaseキーを渡す", async () => {
		const message = { subject: "feat: add feature", body: "", trailers: [] };
		await serializeCommitMsg(message as never);

		expect(mockedInvoke).toHaveBeenCalledWith("serialize_commit_msg", {
			message,
		});
	});

	it("validateCommitMsg はcamelCaseキーを渡す", async () => {
		const message = { subject: "feat: add feature", body: "", trailers: [] };
		await validateCommitMsg(message as never);

		expect(mockedInvoke).toHaveBeenCalledWith("validate_commit_msg", {
			message,
		});
	});
});

describe("IPC エラーハンドリング", () => {
	beforeEach(() => {
		mockedInvoke.mockReset();
	});

	it("safeInvoke は成功時にok: trueを返す", async () => {
		mockedInvoke.mockResolvedValue({
			path: "/tmp/test.txt",
			content: "hello",
		} as never);

		const result = await readFile("/tmp/test.txt");

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual({
				path: "/tmp/test.txt",
				content: "hello",
			});
		}
	});

	it("safeInvoke はエラー時にok: falseを返す", async () => {
		const error = { code: "FileNotFound", details: { path: "/tmp/test.txt" } };
		mockedInvoke.mockRejectedValue(error);

		const result = await readFile("/tmp/test.txt");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toEqual(error);
		}
	});

	it("単一パラメータの関数は正しく引数を渡す", async () => {
		mockedInvoke.mockResolvedValue(undefined as never);

		await writeFile("/tmp/test.txt", "content");
		expect(mockedInvoke).toHaveBeenCalledWith("write_file", {
			path: "/tmp/test.txt",
			content: "content",
		});

		await createBackup("/tmp/test.txt");
		expect(mockedInvoke).toHaveBeenCalledWith("create_backup", {
			path: "/tmp/test.txt",
		});

		await checkBackupExists("/tmp/test.txt");
		expect(mockedInvoke).toHaveBeenCalledWith("check_backup_exists", {
			path: "/tmp/test.txt",
		});

		await deleteBackup("/tmp/test.txt");
		expect(mockedInvoke).toHaveBeenCalledWith("delete_backup", {
			path: "/tmp/test.txt",
		});
	});

	it("readMergeFiles はbaseがnullでも正しく渡す", async () => {
		mockedInvoke.mockResolvedValue(undefined as never);

		await readMergeFiles("/local", "/remote", null, "/merged");

		expect(mockedInvoke).toHaveBeenCalledWith("read_merge_files", {
			local: "/local",
			remote: "/remote",
			base: null,
			merged: "/merged",
		});
	});

	it("parseConflicts はcontentを正しく渡す", async () => {
		mockedInvoke.mockResolvedValue({
			conflicts: [],
			hasConflicts: false,
		} as never);

		await parseConflicts("some content");

		expect(mockedInvoke).toHaveBeenCalledWith("parse_conflicts", {
			content: "some content",
		});
	});

	it("checkGitScAvailable は引数なしで呼ばれる", async () => {
		mockedInvoke.mockResolvedValue(true as never);

		const result = await checkGitScAvailable();

		expect(mockedInvoke).toHaveBeenCalledWith(
			"check_git_sc_available",
			undefined,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBe(true);
		}
	});

	it("checkGitScAvailable はエラー時にok: falseを返す", async () => {
		const error = { code: "CommandFailed", details: {} };
		mockedInvoke.mockRejectedValue(error);

		const result = await checkGitScAvailable();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toEqual(error);
		}
	});

	it("checkCodexAvailable は引数なしで呼ばれる", async () => {
		mockedInvoke.mockResolvedValue(false as never);

		const result = await checkCodexAvailable();

		expect(mockedInvoke).toHaveBeenCalledWith(
			"check_codex_available",
			undefined,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBe(false);
		}
	});

	it("checkCodexAvailable はエラー時にok: falseを返す", async () => {
		const error = { code: "CommandFailed", details: {} };
		mockedInvoke.mockRejectedValue(error);

		const result = await checkCodexAvailable();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toEqual(error);
		}
	});
});
