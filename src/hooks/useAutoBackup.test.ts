import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as ipc from "../types/ipc";
import { useAutoBackup } from "./useAutoBackup";

vi.mock("../types/ipc");
const mockedIpc = vi.mocked(ipc);

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolver) => {
		resolve = resolver;
	});
	return { promise, resolve };
}

describe("useAutoBackup", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.resetAllMocks();
		mockedIpc.createBackup.mockResolvedValue({
			ok: true,
			data: "/tmp/file.backup",
		});
		mockedIpc.deleteBackup.mockResolvedValue({ ok: true, data: undefined });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("dirty 状態で初回バックアップを作成する", async () => {
		const { result } = renderHook(() =>
			useAutoBackup({
				filePath: "/tmp/file.txt",
				isDirty: true,
			}),
		);

		// 初回バックアップの非同期処理を待つ
		await act(async () => {});

		expect(mockedIpc.createBackup).toHaveBeenCalledWith("/tmp/file.txt");
		expect(result.current.hasBackup).toBe(true);
	});

	it("dirty でない場合はバックアップを作成しない", async () => {
		renderHook(() =>
			useAutoBackup({
				filePath: "/tmp/file.txt",
				isDirty: false,
			}),
		);

		await act(async () => {});

		expect(mockedIpc.createBackup).not.toHaveBeenCalled();
	});

	it("filePath が null の場合はバックアップを作成しない", async () => {
		renderHook(() =>
			useAutoBackup({
				filePath: null,
				isDirty: true,
			}),
		);

		await act(async () => {});

		expect(mockedIpc.createBackup).not.toHaveBeenCalled();
	});

	it("enabled: false の場合はバックアップを作成しない", async () => {
		renderHook(() =>
			useAutoBackup({
				filePath: "/tmp/file.txt",
				isDirty: true,
				enabled: false,
			}),
		);

		await act(async () => {});

		expect(mockedIpc.createBackup).not.toHaveBeenCalled();
	});

	it("30秒間隔でバックアップを繰り返す", async () => {
		renderHook(() =>
			useAutoBackup({
				filePath: "/tmp/file.txt",
				isDirty: true,
			}),
		);

		await act(async () => {});
		expect(mockedIpc.createBackup).toHaveBeenCalledTimes(1);

		// 30秒後にインターバルが発火
		await act(async () => {
			vi.advanceTimersByTime(30000);
		});
		expect(mockedIpc.createBackup).toHaveBeenCalledTimes(2);
	});

	it("dirty が false になったらバックアップを削除する", async () => {
		const { result, rerender } = renderHook(
			({ isDirty }: { isDirty: boolean }) =>
				useAutoBackup({
					filePath: "/tmp/file.txt",
					isDirty,
				}),
			{ initialProps: { isDirty: true } },
		);

		// 初回バックアップを待つ
		await act(async () => {});
		expect(mockedIpc.createBackup).toHaveBeenCalledTimes(1);

		// dirty -> false に変更
		rerender({ isDirty: false });
		await act(async () => {});

		expect(mockedIpc.deleteBackup).toHaveBeenCalledWith("/tmp/file.txt");
		expect(result.current.hasBackup).toBe(false);
	});

	it("アンマウント時にインターバルをクリアする", async () => {
		const { unmount } = renderHook(() =>
			useAutoBackup({
				filePath: "/tmp/file.txt",
				isDirty: true,
			}),
		);

		await act(async () => {});
		expect(mockedIpc.createBackup).toHaveBeenCalledTimes(1);

		unmount();

		// アンマウント後はインターバルが発火しない
		await act(async () => {
			vi.advanceTimersByTime(60000);
		});
		expect(mockedIpc.createBackup).toHaveBeenCalledTimes(1);
	});

	it("バックアップ作成に失敗してもエラーにならない", async () => {
		mockedIpc.createBackup.mockResolvedValue({
			ok: false,
			error: { code: "IoError", details: { message: "disk full" } },
		});

		expect(() => {
			renderHook(() =>
				useAutoBackup({
					filePath: "/tmp/file.txt",
					isDirty: true,
				}),
			);
		}).not.toThrow();

		await act(async () => {});
	});

	it("保存完了後に遅れて完了したバックアップを削除する", async () => {
		const deferred =
			createDeferred<Awaited<ReturnType<typeof ipc.createBackup>>>();
		mockedIpc.createBackup.mockReturnValue(deferred.promise);

		const { result, rerender } = renderHook(
			({ isDirty }: { isDirty: boolean }) =>
				useAutoBackup({
					filePath: "/tmp/file.txt",
					isDirty,
				}),
			{ initialProps: { isDirty: true } },
		);

		await act(async () => {});

		rerender({ isDirty: false });
		await act(async () => {});

		await act(async () => {
			deferred.resolve({
				ok: true,
				data: "/tmp/file.backup",
			});
			await deferred.promise;
		});

		expect(mockedIpc.deleteBackup).toHaveBeenCalledWith("/tmp/file.txt");
		expect(result.current.hasBackup).toBe(false);
	});
});
