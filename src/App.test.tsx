import { invoke } from "@tauri-apps/api/core";
import { getMatches } from "@tauri-apps/plugin-cli";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
	useCommitStore,
	useFileStore,
	useHistoryStore,
	useRebaseStore,
} from "./stores";

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: vi.fn(() => ({
		setTitle: vi.fn(),
	})),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedGetMatches = vi.mocked(getMatches);

const targetPath = "/tmp/gui-git-editor-message.txt";
const backupPath = `${targetPath}.backup`;

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolver) => {
		resolve = resolver;
	});
	return { promise, resolve };
}

function setupFileLaunch() {
	mockedGetMatches.mockResolvedValue({
		args: {
			file: {
				value: targetPath,
			},
		},
	} as unknown as Awaited<ReturnType<typeof getMatches>>);
}

function setupInvoke(backup: string | null | Promise<string | null>) {
	mockedInvoke.mockImplementation(async (command, args) => {
		switch (command) {
			case "read_file":
				return {
					path: (args as { path: string }).path,
					content: "initial",
					file_type: "unknown",
				} as never;
			case "check_backup_exists":
				return (await backup) as never;
			case "create_backup":
				return backupPath as never;
			case "write_file":
			case "restore_backup":
			case "delete_backup":
			case "exit_app":
				return undefined as never;
			default:
				throw {
					code: "IoError",
					details: { message: `未対応のIPCコマンド: ${command}` },
				};
		}
	});
}

function commandCallIndex(command: string) {
	return mockedInvoke.mock.calls.findIndex(([calledCommand]) => {
		return calledCommand === command;
	});
}

function commandCallCount(command: string) {
	return mockedInvoke.mock.calls.filter(([calledCommand]) => {
		return calledCommand === command;
	}).length;
}

describe("App", () => {
	beforeEach(() => {
		useFileStore.getState().reset();
		useCommitStore.getState().reset();
		useRebaseStore.getState().reset();
		useHistoryStore.getState().clear();
		vi.clearAllMocks();
		setupFileLaunch();
	});

	it("起動時に既存バックアップを検出して復元できる", async () => {
		const user = userEvent.setup();
		setupInvoke(backupPath);

		render(<App />);

		expect(
			await screen.findByRole("dialog", {
				name: "バックアップが見つかりました",
			}),
		).toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "バックアップから復元" }),
		);

		await waitFor(() => {
			expect(mockedInvoke).toHaveBeenCalledWith("restore_backup", {
				backupPath,
				targetPath,
			});
		});
		expect(
			mockedInvoke.mock.calls.filter(([command]) => command === "read_file"),
		).toHaveLength(2);
	});

	it("編集時に自動バックアップを作成し、保存成功時に削除してから終了する", async () => {
		const user = userEvent.setup();
		setupInvoke(null);

		render(<App />);

		const editor = await screen.findByRole("textbox");
		await user.clear(editor);
		await user.type(editor, "changed");

		await waitFor(() => {
			expect(mockedInvoke).toHaveBeenCalledWith("create_backup", {
				path: targetPath,
			});
		});

		await user.click(screen.getByRole("button", { name: "保存" }));

		await waitFor(() => {
			expect(mockedInvoke).toHaveBeenCalledWith("write_file", {
				path: targetPath,
				content: "changed",
			});
		});
		await waitFor(() => {
			expect(mockedInvoke).toHaveBeenCalledWith("exit_app", { code: 0 });
		});

		expect(commandCallIndex("delete_backup")).toBeGreaterThan(
			commandCallIndex("write_file"),
		);
		expect(commandCallIndex("delete_backup")).toBeLessThan(
			commandCallIndex("exit_app"),
		);
	});

	it("既存バックアップ確認中は自動バックアップを開始しない", async () => {
		const user = userEvent.setup();
		const backupCheck = createDeferred<string | null>();
		setupInvoke(backupCheck.promise);

		render(<App />);

		const editor = await screen.findByRole("textbox");
		await user.clear(editor);
		await user.type(editor, "changed");

		expect(commandCallCount("create_backup")).toBe(0);

		await act(async () => {
			backupCheck.resolve(null);
			await backupCheck.promise;
		});

		await waitFor(() => {
			expect(mockedInvoke).toHaveBeenCalledWith("create_backup", {
				path: targetPath,
			});
		});
	});
});
