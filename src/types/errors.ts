export type AppErrorCode =
  | "FileNotFound"
  | "PermissionDenied"
  | "FileLocked"
  | "ParseError"
  | "IoError"
  | "Unknown";

export interface AppError {
  code: AppErrorCode;
  details: {
    path?: string;
    line?: number;
    message?: string;
  };
}

export function getErrorMessage(error: AppError): string {
  switch (error.code) {
    case "FileNotFound":
      return `File not found: ${error.details.path}`;
    case "PermissionDenied":
      return `Permission denied: ${error.details.path}`;
    case "FileLocked":
      return `File is locked: ${error.details.path}`;
    case "ParseError":
      return `Parse error at line ${error.details.line}: ${error.details.message}`;
    case "IoError":
      return `IO error: ${error.details.message}`;
    default:
      return `Unknown error: ${error.details.message}`;
  }
}
