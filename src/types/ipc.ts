import { invoke } from "@tauri-apps/api/core";
import type { FileContent, RebaseTodoFile } from "./git";
import type { AppError } from "./errors";

// Result type for IPC calls
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

// Wrap invoke to handle errors consistently
async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>
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
  content: string
): Promise<IpcResult<void>> {
  return safeInvoke<void>("write_file", { path, content });
}

export async function createBackup(path: string): Promise<IpcResult<string>> {
  return safeInvoke<string>("create_backup", { path });
}

export async function restoreBackup(
  backupPath: string,
  originalPath: string
): Promise<IpcResult<void>> {
  return safeInvoke<void>("restore_backup", { backupPath, originalPath });
}

export async function exitApp(code: number): Promise<void> {
  await invoke("exit_app", { code });
}

// Rebase operations
export async function parseRebaseTodo(
  content: string
): Promise<IpcResult<RebaseTodoFile>> {
  return safeInvoke<RebaseTodoFile>("parse_rebase_todo", { content });
}

export async function serializeRebaseTodo(
  file: RebaseTodoFile
): Promise<IpcResult<string>> {
  return safeInvoke<string>("serialize_rebase_todo", { file });
}
