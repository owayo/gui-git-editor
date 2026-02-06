// Git file types
export type GitFileType =
	| "rebase_todo"
	| "commit_msg"
	| "merge_msg"
	| "squash_msg"
	| "tag_msg"
	| "merge"
	| "unknown";

// Merge file paths from CLI arguments
export interface MergeFilePaths {
	local: string;
	remote: string;
	base: string | null;
	merged: string;
}

// Rebase command types
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
			value: { commit: string | null; label: string; message: string | null };
	  };

// Rebase entry
export interface RebaseEntry {
	id: string;
	command: RebaseCommandType;
	commit_hash: string;
	message: string;
}

// Rebase todo file
export interface RebaseTodoFile {
	entries: RebaseEntry[];
	comments: string[];
}

// Git trailer (metadata like Signed-off-by)
export interface Trailer {
	key: string;
	value: string;
}

// Commit message
export interface CommitMessage {
	subject: string;
	body: string;
	trailers: Trailer[];
	comments: string[];
	diff_content: string | null;
}

// Commit validation result
export interface CommitValidation {
	is_valid: boolean;
	subject_too_long: boolean;
	subject_length: number;
	long_body_lines: [number, number][]; // [line_number, length]
}

// File content from backend
export interface FileContent {
	path: string;
	content: string;
	file_type: GitFileType;
}

// Simple command types for UI
export const SIMPLE_COMMANDS = [
	"pick",
	"reword",
	"edit",
	"squash",
	"fixup",
	"drop",
] as const;
export type SimpleCommand = (typeof SIMPLE_COMMANDS)[number];

// Command colors for UI
export const COMMAND_COLORS: Record<SimpleCommand, string> = {
	pick: "bg-green-500",
	reword: "bg-yellow-500",
	edit: "bg-blue-500",
	squash: "bg-purple-500",
	fixup: "bg-orange-500",
	drop: "bg-red-500",
};

// Command labels
export const COMMAND_LABELS: Record<SimpleCommand, string> = {
	pick: "Pick",
	reword: "Reword",
	edit: "Edit",
	squash: "Squash",
	fixup: "Fixup",
	drop: "Drop",
};
