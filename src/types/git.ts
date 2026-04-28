// Git ファイル種別。
export type GitFileType =
	| "rebase_todo"
	| "commit_msg"
	| "merge_msg"
	| "squash_msg"
	| "tag_msg"
	| "merge"
	| "unknown";

// CLI 引数から渡されるマージ用ファイルパス。
export interface MergeFilePaths {
	local: string;
	remote: string;
	base: string | null;
	merged: string;
}

// Rebase コマンド種別。
export type RebaseCommandType =
	| { type: "pick" }
	| { type: "reword" }
	| { type: "edit" }
	| { type: "squash" }
	| { type: "fixup" }
	| { type: "drop" }
	| { type: "exec"; value: string }
	| { type: "break" }
	| { type: "label"; value: string }
	| { type: "reset"; value: string }
	| {
			type: "merge";
			value: {
				commit: string | null;
				edit_message: boolean;
				label: string;
				message: string | null;
			};
	  };

// Rebase エントリ。
export interface RebaseEntry {
	id: string;
	command: RebaseCommandType;
	commit_hash: string;
	message: string;
}

// Rebase todo ファイル。
export interface RebaseTodoFile {
	entries: RebaseEntry[];
	comments: string[];
}

// Signed-off-by などの Git trailer。
export interface Trailer {
	key: string;
	value: string;
}

// コミットメッセージ。
export interface CommitMessage {
	subject: string;
	body: string;
	trailers: Trailer[];
	comments: string[];
	diff_content: string | null;
}

// バックエンドから返るマージ用ファイル内容。
export interface MergeFileContent {
	path: string;
	content: string;
}

// バックエンドから返る全マージ用ファイル。
export interface MergeFiles {
	local: MergeFileContent;
	remote: MergeFileContent;
	base: MergeFileContent | null;
	merged: MergeFileContent;
	language: string;
	localLabel: string;
	remoteLabel: string;
}

// コンフリクトマーカーから解析した 1 つのコンフリクト領域。
export interface ConflictRegion {
	id: number;
	startLine: number;
	localStartLine: number;
	localEndLine: number;
	baseStartLine: number | null;
	baseEndLine: number | null;
	remoteStartLine: number;
	remoteEndLine: number;
	endLine: number;
	localContent: string;
	baseContent: string | null;
	remoteContent: string;
	resolved: boolean;
}

// コンフリクトマーカー解析結果。
export interface ParseConflictsResult {
	conflicts: ConflictRegion[];
	hasConflicts: boolean;
	totalConflicts: number;
}

// 1 行分の git blame 情報。
export interface BlameLine {
	lineNumber: number;
	hash: string;
	author: string;
	date: string;
	summary: string;
}

// git status --porcelain から得るファイル状態。
export interface FileStatus {
	path: string;
	originalPath: string | null;
	indexStatus: string;
	worktreeStatus: string;
}

// 分類済みファイルを含む Git status 結果。
export interface GitStatusResult {
	staged: FileStatus[];
	unstaged: FileStatus[];
	untracked: FileStatus[];
	repoRoot: string;
	branchName: string;
}

// commit diff-tree から得るファイル情報。
export interface CommitFileInfo {
	path: string;
	originalPath: string | null;
	status: string;
}

// コミットメッセージ検証結果。
export interface CommitValidation {
	is_valid: boolean;
	subject_too_long: boolean;
	subject_length: number;
	long_body_lines: [number, number][]; // [行番号, 文字数]
}

// バックエンドから返るファイル内容。
export interface FileContent {
	path: string;
	content: string;
	file_type: GitFileType;
}

// UI で直接選べる基本コマンド。
export const SIMPLE_COMMANDS = [
	"pick",
	"reword",
	"edit",
	"squash",
	"fixup",
	"drop",
] as const;
export type SimpleCommand = (typeof SIMPLE_COMMANDS)[number];

// コマンド表示色。
export const COMMAND_COLORS: Record<SimpleCommand, string> = {
	pick: "bg-green-500",
	reword: "bg-yellow-500",
	edit: "bg-blue-500",
	squash: "bg-purple-500",
	fixup: "bg-orange-500",
	drop: "bg-red-500",
};

// コマンドラベル。
export const COMMAND_LABELS: Record<SimpleCommand, string> = {
	pick: "Pick",
	reword: "Reword",
	edit: "Edit",
	squash: "Squash",
	fixup: "Fixup",
	drop: "Drop",
};
