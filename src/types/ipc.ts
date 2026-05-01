import { invoke } from "@tauri-apps/api/core";
import type { AppError } from "./errors";
import type {
	BlameLine,
	CommitFileInfo,
	CommitMessage,
	CommitValidation,
	FileContent,
	GitStatusResult,
	MergeFiles,
	ParseConflictsResult,
	RebaseTodoFile,
} from "./git";

// IPC 呼び出し結果。
export type IpcResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: AppError };

// invoke をラップし、エラー処理を一貫させる。
async function safeInvoke<T>(
	command: string,
	args?: Record<string, unknown>,
): Promise<IpcResult<T>> {
	try {
		const data = await invoke<T>(command, args);
		return { ok: true, data };
	} catch (error) {
		return { ok: false, error: error as AppError };
	}
}

// ファイル操作。
export async function readFile(path: string): Promise<IpcResult<FileContent>> {
	return safeInvoke<FileContent>("read_file", { path });
}

export async function writeFile(
	path: string,
	content: string,
): Promise<IpcResult<void>> {
	return safeInvoke<void>("write_file", { path, content });
}

export async function createBackup(path: string): Promise<IpcResult<string>> {
	return safeInvoke<string>("create_backup", { path });
}

export async function restoreBackup(
	backupPath: string,
	targetPath: string,
): Promise<IpcResult<void>> {
	return safeInvoke<void>("restore_backup", {
		backupPath,
		targetPath,
	});
}

export async function checkBackupExists(
	path: string,
): Promise<IpcResult<string | null>> {
	return safeInvoke<string | null>("check_backup_exists", { path });
}

export async function deleteBackup(path: string): Promise<IpcResult<void>> {
	return safeInvoke<void>("delete_backup", { path });
}

export async function exitApp(code: number): Promise<void> {
	await invoke("exit_app", { code });
}

// Rebase 操作。
export async function parseRebaseTodo(
	content: string,
): Promise<IpcResult<RebaseTodoFile>> {
	return safeInvoke<RebaseTodoFile>("parse_rebase_todo", { content });
}

export async function serializeRebaseTodo(
	file: RebaseTodoFile,
): Promise<IpcResult<string>> {
	return safeInvoke<string>("serialize_rebase_todo", { file });
}

export async function generateCommitMessage(
	hashes: string[],
	withBody: boolean = false,
): Promise<IpcResult<string>> {
	const result = await safeInvoke<string>("generate_commit_message", {
		hashes,
		withBody,
	});
	return result;
}

export async function generateCommitMessageFromStaged(
	withBody: boolean = false,
): Promise<IpcResult<string>> {
	const result = await safeInvoke<string>(
		"generate_commit_message_from_staged",
		{
			withBody,
		},
	);
	return result;
}

// コミットメッセージ操作。
export async function parseCommitMsg(
	content: string,
): Promise<IpcResult<CommitMessage>> {
	return safeInvoke<CommitMessage>("parse_commit_msg", { content });
}

export async function serializeCommitMsg(
	message: CommitMessage,
): Promise<IpcResult<string>> {
	return safeInvoke<string>("serialize_commit_msg", { message });
}

export async function validateCommitMsg(
	message: CommitMessage,
): Promise<IpcResult<CommitValidation>> {
	return safeInvoke<CommitValidation>("validate_commit_msg", { message });
}

// マージ操作。
export async function readMergeFiles(
	local: string,
	remote: string,
	base: string | null,
	merged: string,
): Promise<IpcResult<MergeFiles>> {
	return safeInvoke<MergeFiles>("read_merge_files", {
		local,
		remote,
		base,
		merged,
	});
}

export async function parseConflicts(
	content: string,
): Promise<IpcResult<ParseConflictsResult>> {
	return safeInvoke<ParseConflictsResult>("parse_conflicts", { content });
}

// マージ用 Git blame。
export async function gitBlameForMerge(
	mergedPath: string,
	side: "local" | "remote",
): Promise<IpcResult<BlameLine[]>> {
	return safeInvoke<BlameLine[]>("git_blame_for_merge", { mergedPath, side });
}

// git-sc の利用可否確認。
export async function checkGitScAvailable(): Promise<IpcResult<boolean>> {
	return safeInvoke<boolean>("check_git_sc_available");
}

// Codex CLI 操作。
export async function checkCodexAvailable(): Promise<IpcResult<boolean>> {
	return safeInvoke<boolean>("check_codex_available");
}

export async function openCodexTerminal(
	mergedPath: string,
): Promise<IpcResult<void>> {
	return safeInvoke<void>("open_codex_terminal", { mergedPath });
}

// ステージング操作。
export async function gitStatus(
	filePath: string,
): Promise<IpcResult<GitStatusResult>> {
	return safeInvoke<GitStatusResult>("git_status", { filePath });
}

export async function gitStageFile(
	filePath: string,
	target: string,
): Promise<IpcResult<void>> {
	return safeInvoke<void>("git_stage_file", { filePath, target });
}

export async function gitUnstageFile(
	filePath: string,
	target: string,
): Promise<IpcResult<void>> {
	return safeInvoke<void>("git_unstage_file", { filePath, target });
}

export async function gitStageAll(filePath: string): Promise<IpcResult<void>> {
	return safeInvoke<void>("git_stage_all", { filePath });
}

export async function gitDiffFile(
	filePath: string,
	target: string,
	staged: boolean,
): Promise<IpcResult<string>> {
	return safeInvoke<string>("git_diff_file", { filePath, target, staged });
}

// コミット差分操作。
export async function gitCommitFiles(
	filePath: string,
	commitHash: string,
): Promise<IpcResult<CommitFileInfo[]>> {
	return safeInvoke<CommitFileInfo[]>("git_commit_files", {
		filePath,
		commitHash,
	});
}

export async function gitCommitDiff(
	filePath: string,
	commitHash: string,
	targetFile: string,
): Promise<IpcResult<string>> {
	return safeInvoke<string>("git_commit_diff", {
		filePath,
		commitHash,
		targetFile,
	});
}
