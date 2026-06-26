import { useCallback, useEffect, useRef, useState } from "react";
import { createBackup, deleteBackup } from "../types/ipc";

const BACKUP_INTERVAL_MS = 30000; // 30秒

interface UseAutoBackupOptions {
	filePath: string | null;
	isDirty: boolean;
	enabled?: boolean;
}

export function useAutoBackup({
	filePath,
	isDirty,
	enabled = true,
}: UseAutoBackupOptions) {
	const [hasBackup, setHasBackup] = useState(false);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const lastBackupFilePathRef = useRef<string | null>(null);
	const filePathRef = useRef<string | null>(filePath);
	const isDirtyRef = useRef(isDirty);
	const enabledRef = useRef(enabled);
	const backupGenerationRef = useRef(0);
	// create/delete のディスク操作を直列化し、同一 .backup への並行アクセスを防ぐキュー。
	// 「作成と削除がすれ違い hasBackup とディスク状態が食い違う」競合を根本から避ける。
	const backupQueueRef = useRef<Promise<unknown>>(Promise.resolve());

	const enqueueBackupOp = useCallback(<T>(op: () => Promise<T>): Promise<T> => {
		// 直前の操作の成否に関わらず次を実行する（前段が失敗してもキューを止めない）
		const next = backupQueueRef.current.then(op, op);
		backupQueueRef.current = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}, []);

	const setTrackedBackupFile = useCallback((backupFilePath: string | null) => {
		lastBackupFilePathRef.current = backupFilePath;
		setHasBackup(backupFilePath !== null);
	}, []);

	useEffect(() => {
		filePathRef.current = filePath;
		isDirtyRef.current = isDirty;
		enabledRef.current = enabled;

		if (!enabled || !filePath || !isDirty) {
			backupGenerationRef.current += 1;
		}
	}, [enabled, filePath, isDirty]);

	// バックアップを作成する
	const performBackup = useCallback(async () => {
		if (!filePath || !isDirty) return;

		const requestedFilePath = filePath;
		const generation = backupGenerationRef.current;

		try {
			const result = await enqueueBackupOp(() =>
				createBackup(requestedFilePath),
			);
			if (!result.ok) {
				return;
			}

			const isStale =
				generation !== backupGenerationRef.current ||
				filePathRef.current !== requestedFilePath ||
				!isDirtyRef.current ||
				!enabledRef.current;

			if (isStale) {
				await enqueueBackupOp(() => deleteBackup(requestedFilePath));
				return;
			}

			setTrackedBackupFile(requestedFilePath);
		} catch (error) {
			console.error("バックアップの作成に失敗しました:", error);
		}
	}, [filePath, isDirty, setTrackedBackupFile, enqueueBackupOp]);

	// 保存完了後やクリーン復帰時にバックアップを削除する
	const clearBackup = useCallback(
		async (targetFilePath?: string) => {
			const pathToDelete =
				targetFilePath ?? lastBackupFilePathRef.current ?? filePathRef.current;
			if (!pathToDelete) return;

			try {
				const result = await enqueueBackupOp(() => deleteBackup(pathToDelete));
				if (result.ok) {
					setTrackedBackupFile(null);
				}
			} catch (error) {
				console.error("バックアップの削除に失敗しました:", error);
			}
		},
		[setTrackedBackupFile, enqueueBackupOp],
	);

	// 自動バックアップのタイマーを設定する
	useEffect(() => {
		if (!enabled || !filePath) {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
			return;
		}

		// dirty なら初回バックアップを即時作成する
		if (isDirty) {
			performBackup();
		}

		// 定期バックアップを設定する
		intervalRef.current = setInterval(() => {
			if (isDirty) {
				performBackup();
			}
		}, BACKUP_INTERVAL_MS);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [enabled, filePath, isDirty, performBackup]);

	// 保存済み状態に戻ったらバックアップを削除する
	useEffect(() => {
		if (!isDirty && lastBackupFilePathRef.current) {
			clearBackup(lastBackupFilePathRef.current);
		}
	}, [isDirty, clearBackup]);

	return {
		performBackup,
		clearBackup,
		hasBackup,
	};
}
