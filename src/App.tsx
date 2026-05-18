import { getCurrentWindow } from "@tauri-apps/api/window";
import { getMatches } from "@tauri-apps/plugin-cli";
import { useCallback, useEffect, useRef, useState } from "react";
import { CommitEditor } from "./components/commit";
import {
	ActionBar,
	BackupRecoveryDialog,
	ErrorDisplay,
	Loading,
} from "./components/common";
import { FallbackEditor } from "./components/fallback";
import { MergeActionBar, MergeEditor } from "./components/merge";
import { RebaseEditor } from "./components/rebase";
import { useAutoBackup, useKeyboardShortcuts } from "./hooks";
import {
	useCommitStore,
	useFileStore,
	useHistoryStore,
	useRebaseStore,
} from "./stores";
import type { AppError } from "./types/errors";
import type { MergeFilePaths } from "./types/git";
import {
	checkBackupExists,
	deleteBackup,
	exitApp,
	restoreBackup,
} from "./types/ipc";

function App() {
	const [isMergeMode, setIsMergeMode] = useState(false);
	const [mergeFilePaths, setMergeFilePaths] = useState<MergeFilePaths | null>(
		null,
	);
	const [backupPathToRecover, setBackupPathToRecover] = useState<string | null>(
		null,
	);
	const [isCheckingBackup, setIsCheckingBackup] = useState(false);
	const [backupError, setBackupError] = useState<AppError | null>(null);

	const {
		filePath,
		fileType,
		currentContent,
		isLoading: fileLoading,
		isSaving,
		error: fileError,
		isDirty,
		loadFile,
		saveFile,
		setContent,
		clearError: clearFileError,
	} = useFileStore();

	const {
		entries,
		isLoading: rebaseLoading,
		error: rebaseError,
		isDirty: rebaseIsDirty,
		parseContent,
		serialize,
		setEntries,
		clearError: clearRebaseError,
		getValidationError,
	} = useRebaseStore();

	const {
		isLoading: commitLoading,
		error: commitError,
		isDirty: commitIsDirty,
		parseContent: parseCommitContent,
		serialize: serializeCommit,
		clearError: clearCommitError,
	} = useCommitStore();

	const {
		canUndo,
		canRedo,
		undo,
		redo,
		pushSnapshot,
		clear: clearHistory,
	} = useHistoryStore();

	const isLoading = fileLoading || rebaseLoading || commitLoading;
	const error = fileError || rebaseError || commitError || backupError;

	// ファイルがコミットメッセージ系か判定する。
	const isCommitType =
		fileType === "commit_msg" ||
		fileType === "merge_msg" ||
		fileType === "squash_msg" ||
		fileType === "tag_msg";

	const effectiveIsDirty =
		fileType === "rebase_todo"
			? rebaseIsDirty
			: isCommitType
				? commitIsDirty
				: isDirty;
	const { clearBackup } = useAutoBackup({
		filePath,
		isDirty: effectiveIsDirty,
		enabled: !isMergeMode && !isCheckingBackup && backupPathToRecover === null,
	});

	// マウント時に CLI 引数からファイルを読み込む。
	useEffect(() => {
		async function loadFromCli() {
			try {
				const matches = await getMatches();
				const args = matches.args;

				// マージモードか確認する。
				if (args.merge?.occurrences && args.merge.occurrences > 0) {
					const local = args.local?.value;
					const remote = args.remote?.value;
					const base = args.base?.value;
					const merged = args.merged?.value;

					if (
						typeof local === "string" &&
						typeof remote === "string" &&
						typeof merged === "string"
					) {
						const paths: MergeFilePaths = {
							local,
							remote,
							base: typeof base === "string" ? base : null,
							merged,
						};
						setIsMergeMode(true);
						setMergeFilePaths(paths);

						// マージモード用にウィンドウタイトルを設定する。
						const mergedFileName = merged.split("/").pop() ?? merged;
						await getCurrentWindow().setTitle(`マージ: ${mergedFileName}`);
						return;
					}
				}

				if (args.file && typeof args.file.value === "string") {
					const targetPath = args.file.value;
					await loadFile(targetPath);
				}
			} catch (err) {
				console.error("CLI 引数の取得に失敗しました:", err);
			}
		}

		loadFromCli();
	}, [loadFile]);

	// ファイル読み込み後に前回セッションのバックアップを確認する。
	useEffect(() => {
		let isCancelled = false;
		setBackupPathToRecover(null);
		setBackupError(null);

		if (!filePath || isMergeMode) {
			setIsCheckingBackup(false);
			return () => {
				isCancelled = true;
			};
		}

		const checkedFilePath = filePath;
		setIsCheckingBackup(true);

		async function checkExistingBackup() {
			const result = await checkBackupExists(checkedFilePath);
			if (isCancelled) return;

			if (result.ok) {
				setBackupPathToRecover(result.data);
			} else {
				setBackupError(result.error);
			}
			setIsCheckingBackup(false);
		}

		checkExistingBackup();

		return () => {
			isCancelled = true;
		};
	}, [filePath, isMergeMode]);

	// ファイル読み込み後に rebase 内容を解析する。
	useEffect(() => {
		if (fileType === "rebase_todo" && currentContent) {
			parseContent(currentContent);
		}
	}, [fileType, currentContent, parseContent]);

	// ファイル読み込み後にコミットメッセージ内容を解析する。
	useEffect(() => {
		if (isCommitType && currentContent) {
			parseCommitContent(currentContent);
		}
	}, [isCommitType, currentContent, parseCommitContent]);

	// 保存処理。
	const handleSave = useCallback(async () => {
		let success = false;

		if (fileType === "rebase_todo") {
			const serialized = await serialize();
			if (serialized) {
				setContent(serialized);
				success = await saveFile();
			}
		} else if (isCommitType) {
			const serialized = await serializeCommit();
			if (serialized) {
				setContent(serialized);
				success = await saveFile();
			}
		} else {
			success = await saveFile();
		}

		if (success) {
			await clearBackup(filePath ?? undefined);
			await exitApp(0);
		}
	}, [
		clearBackup,
		filePath,
		fileType,
		isCommitType,
		serialize,
		serializeCommit,
		setContent,
		saveFile,
	]);

	// キャンセル処理。
	const handleCancel = useCallback(async () => {
		await exitApp(1);
	}, []);

	const handleRestoreBackup = useCallback(async () => {
		if (!backupPathToRecover || !filePath) return;

		const result = await restoreBackup(backupPathToRecover, filePath);
		if (result.ok) {
			setBackupPathToRecover(null);
			await loadFile(filePath);
		} else {
			setBackupError(result.error);
		}
	}, [backupPathToRecover, filePath, loadFile]);

	const handleDiscardBackup = useCallback(async () => {
		if (!filePath) return;

		const result = await deleteBackup(filePath);
		if (result.ok) {
			setBackupPathToRecover(null);
		} else {
			setBackupError(result.error);
		}
	}, [filePath]);

	// undo/redo 経由の entries 変更では pushSnapshot をスキップするためのフラグ
	const isUndoRedoRef = useRef(false);

	// undo 処理。
	const handleUndo = useCallback(() => {
		const previousEntries = undo();
		if (previousEntries) {
			isUndoRedoRef.current = true;
			setEntries(previousEntries);
		}
	}, [undo, setEntries]);

	// redo 処理。
	const handleRedo = useCallback(() => {
		const nextEntries = redo();
		if (nextEntries) {
			isUndoRedoRef.current = true;
			setEntries(nextEntries);
		}
	}, [redo, setEntries]);

	// entries が変更されたら履歴スナップショットを追加する。
	useEffect(() => {
		if (entries.length > 0) {
			if (isUndoRedoRef.current) {
				isUndoRedoRef.current = false;
				return;
			}
			pushSnapshot(entries);
		}
	}, [entries, pushSnapshot]);

	// ファイルが変わったら履歴をクリアする。
	// biome-ignore lint/correctness/useExhaustiveDependencies: ファイル変更時に履歴をクリアするため filePath を意図的に含める
	useEffect(() => {
		clearHistory();
	}, [filePath, clearHistory]);

	// マージモード以外でキーボードショートカットを有効化
	// マージモードでは MergeEditor 内の useMergeKeyboardShortcuts が処理する
	useKeyboardShortcuts(
		isMergeMode
			? {}
			: {
					onSave: handleSave,
					onCancel: handleCancel,
					onUndo: handleUndo,
					onRedo: handleRedo,
				},
	);

	const clearError = useCallback(() => {
		clearFileError();
		clearRebaseError();
		clearCommitError();
		setBackupError(null);
	}, [clearFileError, clearRebaseError, clearCommitError]);

	// 読み込み状態を表示する。
	if (isLoading) {
		return (
			<div className="flex h-screen flex-col bg-white dark:bg-gray-900">
				<Loading message="ファイルを読み込み中..." />
			</div>
		);
	}

	// マージモードを表示する。
	if (isMergeMode && mergeFilePaths) {
		return (
			<div className="flex h-screen flex-col bg-white dark:bg-gray-900">
				<main className="flex-1 overflow-hidden">
					<MergeEditor filePaths={mergeFilePaths} />
				</main>
				<MergeActionBar />
			</div>
		);
	}

	// ファイルが読み込まれていない場合はエラーを表示する。
	if (!filePath) {
		return (
			<div className="flex h-screen flex-col items-center justify-center bg-white dark:bg-gray-900">
				<p className="text-gray-500 dark:text-gray-400">
					ファイルが指定されていません
				</p>
				<p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
					使用方法: gui-git-editor &lt;ファイルパス&gt;
				</p>
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col bg-white dark:bg-gray-900">
			{backupPathToRecover && (
				<BackupRecoveryDialog
					onRestore={handleRestoreBackup}
					onDiscard={handleDiscardBackup}
				/>
			)}

			{error && (
				<div className="p-4">
					<ErrorDisplay error={error} onDismiss={clearError} />
				</div>
			)}

			<main className="flex-1 overflow-auto p-4">
				{fileType === "rebase_todo" ? (
					<RebaseEditor />
				) : isCommitType ? (
					<CommitEditor />
				) : (
					<FallbackEditor />
				)}
			</main>

			<ActionBar
				onSave={handleSave}
				onCancel={handleCancel}
				onUndo={fileType === "rebase_todo" ? handleUndo : undefined}
				onRedo={fileType === "rebase_todo" ? handleRedo : undefined}
				canUndo={canUndo()}
				canRedo={canRedo()}
				isSaving={isSaving}
				isDirty={
					fileType === "rebase_todo"
						? rebaseIsDirty
						: isCommitType
							? true
							: isDirty
				}
				saveLabel={fileType === "rebase_todo" ? "Rebaseを開始" : "保存"}
				validationError={
					fileType === "rebase_todo" ? getValidationError() : null
				}
			/>
		</div>
	);
}

export default App;
