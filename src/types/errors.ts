export type AppErrorCode =
	| "FileNotFound"
	| "PermissionDenied"
	| "FileLocked"
	| "ParseError"
	| "IoError"
	| "CommandError"
	| "Unknown";

export interface AppError {
	code: AppErrorCode;
	details: {
		path?: string;
		line?: number;
		message?: string;
	};
}

export function getErrorMessage(error: AppError | unknown): string {
	// AppError 以外の値を扱う。
	if (!error || typeof error !== "object") {
		return `Unknown error: ${String(error)}`;
	}

	const appError = error as AppError;

	// 期待する構造を持つか確認する。
	if (!appError.code || !appError.details) {
		// 生のエラー、または別構造のエラーの可能性がある。
		if (
			"message" in error &&
			typeof (error as { message: string }).message === "string"
		) {
			return (error as { message: string }).message;
		}
		return `Unknown error: ${JSON.stringify(error)}`;
	}

	switch (appError.code) {
		case "FileNotFound":
			return `File not found: ${appError.details.path}`;
		case "PermissionDenied":
			return `Permission denied: ${appError.details.path}`;
		case "FileLocked":
			return `File is locked: ${appError.details.path}`;
		case "ParseError":
			return `Parse error at line ${appError.details.line}: ${appError.details.message}`;
		case "IoError":
			return `IO error: ${appError.details.message}`;
		case "CommandError":
			return `Command error: ${appError.details.message}`;
		default:
			return `Unknown error: ${appError.details.message ?? JSON.stringify(appError)}`;
	}
}
