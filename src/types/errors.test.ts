import { describe, expect, it } from "vitest";
import { type AppError, getErrorMessage } from "./errors";

describe("getErrorMessage", () => {
	it("returns FileNotFound message with path", () => {
		const error: AppError = {
			code: "FileNotFound",
			details: { path: "/tmp/test.txt" },
		};
		expect(getErrorMessage(error)).toBe("File not found: /tmp/test.txt");
	});

	it("returns PermissionDenied message with path", () => {
		const error: AppError = {
			code: "PermissionDenied",
			details: { path: "/etc/secret" },
		};
		expect(getErrorMessage(error)).toBe("Permission denied: /etc/secret");
	});

	it("returns FileLocked message with path", () => {
		const error: AppError = {
			code: "FileLocked",
			details: { path: "/tmp/locked.txt" },
		};
		expect(getErrorMessage(error)).toBe("File is locked: /tmp/locked.txt");
	});

	it("returns ParseError message with line and message", () => {
		const error: AppError = {
			code: "ParseError",
			details: { line: 42, message: "unexpected token" },
		};
		expect(getErrorMessage(error)).toBe(
			"Parse error at line 42: unexpected token",
		);
	});

	it("returns IoError message", () => {
		const error: AppError = {
			code: "IoError",
			details: { message: "disk full" },
		};
		expect(getErrorMessage(error)).toBe("IO error: disk full");
	});

	it("returns CommandError message", () => {
		const error: AppError = {
			code: "CommandError",
			details: { message: "git not found" },
		};
		expect(getErrorMessage(error)).toBe("Command error: git not found");
	});

	it("returns Unknown error message", () => {
		const error: AppError = {
			code: "Unknown",
			details: { message: "something went wrong" },
		};
		expect(getErrorMessage(error)).toBe("Unknown error: something went wrong");
	});

	it("handles null/undefined input", () => {
		expect(getErrorMessage(null)).toBe("Unknown error: null");
		expect(getErrorMessage(undefined)).toBe("Unknown error: undefined");
	});

	it("handles plain Error object", () => {
		const error = new Error("plain error");
		expect(getErrorMessage(error)).toBe("plain error");
	});

	it("handles object without code/details", () => {
		const error = { foo: "bar" };
		const result = getErrorMessage(error);
		expect(result).toContain("Unknown error:");
	});
});
