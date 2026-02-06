import { invoke } from "@tauri-apps/api/core";
import type { AppError } from "./errors";
import type {
	CommitMessage,
	CommitValidation,
	FileContent,
	MergeFiles,
	ParseConflictsResult,
	RebaseTodoFile,
} from "./git";

// Result type for IPC calls
export type IpcResult<T> =
	| { ok: true; data: T }
	| { ok: false; error: AppError };

// Wrap invoke to handle errors consistently
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

// File operations
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
		backup_path: backupPath,
		target_path: targetPath,
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

// Rebase operations
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
	console.log("[IPC] generate_commit_message", { hashes, withBody });
	const result = await safeInvoke<string>("generate_commit_message", {
		hashes,
		withBody,
	});
	console.log("[IPC] generate_commit_message result:", result);
	return result;
}

export async function generateCommitMessageFromStaged(
	withBody: boolean = false,
): Promise<IpcResult<string>> {
	console.log("[IPC] generate_commit_message_from_staged", { withBody });
	const result = await safeInvoke<string>(
		"generate_commit_message_from_staged",
		{
			withBody,
		},
	);
	console.log("[IPC] generate_commit_message_from_staged result:", result);
	return result;
}

// Commit message operations
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

// Merge operations
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

// Codex CLI operations
export async function checkCodexAvailable(): Promise<IpcResult<boolean>> {
	return safeInvoke<boolean>("check_codex_available");
}

export async function openCodexTerminal(
	mergedPath: string,
): Promise<IpcResult<void>> {
	return safeInvoke<void>("open_codex_terminal", { mergedPath });
}
