import { create } from "zustand";
import type { AppError } from "../types/errors";
import type {
	BlameLine,
	ConflictRegion,
	ResolvedReplacement,
} from "../types/git";
import * as ipc from "../types/ipc";
import {
	buildConflictMarkerText,
	buildConflictState,
	checkAllResolved,
	findReplacementStartLine,
	markResolvedAndShiftConflicts,
	markRevertedAndShiftConflicts,
	preserveResolvedConflictsAfterEdit,
	reconcileConflictsOnReload,
	resolveConflictInContent,
	updateResolvedReplacementsAfterResolve,
	updateResolvedReplacementsAfterRevert,
} from "../utils/mergeConflictState";

interface MergeState {
	// ファイル内容
	localContent: string | null;
	remoteContent: string | null;
	baseContent: string | null;
	mergedContent: string | null;
	mergedPath: string | null;
	language: string;

	// コンフリクト状態
	conflicts: ConflictRegion[];
	currentConflictIndex: number;
	allResolved: boolean;

	// UI 状態
	isLoading: boolean;
	isSaving: boolean;
	error: AppError | null;
	isDirty: boolean;

	// ブランチラベル
	localLabel: string;
	remoteLabel: string;

	// Codex 状態
	codexAvailable: boolean | null;

	// サイドパネル用の blame 情報
	localBlame: BlameLine[] | null;
	remoteBlame: BlameLine[] | null;

	// revert 用に、解決時の置換テキストをコンフリクトごとに保持する
	resolvedReplacements: Record<number, ResolvedReplacement>;

	// 操作
	initMerge: (
		local: string,
		remote: string,
		base: string | null,
		merged: string,
	) => Promise<void>;
	acceptLocal: (conflictId: number) => void;
	acceptRemote: (conflictId: number) => void;
	acceptBoth: (conflictId: number) => void;
	revertConflict: (conflictId: number) => void;
	updateMergedContent: (content: string) => void;
	goToNextConflict: () => number | null;
	goToPrevConflict: () => number | null;
	save: () => Promise<boolean>;
	fetchBlame: () => Promise<void>;
	reloadMergedFile: () => Promise<void>;
	checkCodexAvailable: () => Promise<void>;
	openCodexResolve: () => Promise<void>;
	clearError: () => void;
}

const initialState = {
	localContent: null,
	remoteContent: null,
	baseContent: null,
	mergedContent: null,
	mergedPath: null,
	language: "plaintext",
	conflicts: [] as ConflictRegion[],
	currentConflictIndex: 0,
	allResolved: false,
	isLoading: false,
	isSaving: false,
	error: null,
	isDirty: false,
	localLabel: "LOCAL",
	remoteLabel: "REMOTE",
	codexAvailable: null,
	localBlame: null,
	remoteBlame: null,
	resolvedReplacements: {} as Record<number, ResolvedReplacement>,
};

export const useMergeStore = create<MergeState>((set, get) => {
	let contentParseRequestId = 0;
	// blame 取得は新しい initMerge で別パスを読み込むと stale になりうるため、
	// リクエスト ID で照合して古い応答を破棄する
	let blameRequestId = 0;

	const invalidateContentParse = () => {
		contentParseRequestId += 1;
	};

	return {
		...initialState,

		initMerge: async (local, remote, base, merged) => {
			invalidateContentParse();
			// 進行中の旧 fetchBlame 応答を無効化し、旧ファイルの blame が
			// 新ファイルに紛れ込まないよう即時クリアする
			blameRequestId += 1;
			set({
				isLoading: true,
				error: null,
				localBlame: null,
				remoteBlame: null,
			});

			const filesResult = await ipc.readMergeFiles(local, remote, base, merged);
			if (!filesResult.ok) {
				set({ error: filesResult.error, isLoading: false });
				return;
			}

			const files = filesResult.data;

			const parseResult = await ipc.parseConflicts(files.merged.content);
			if (!parseResult.ok) {
				set({ error: parseResult.error, isLoading: false });
				return;
			}

			set({
				localContent: files.local.content,
				remoteContent: files.remote.content,
				baseContent: files.base?.content ?? null,
				mergedContent: files.merged.content,
				mergedPath: files.merged.path,
				language: files.language,
				localLabel: files.localLabel,
				remoteLabel: files.remoteLabel,
				conflicts: parseResult.data.conflicts,
				currentConflictIndex: 0,
				allResolved: !parseResult.data.hasConflicts,
				isLoading: false,
				isDirty: false,
			});

			// blame 取得は UI をブロックしないようにバックグラウンドで走らせる
			void get().fetchBlame();
		},

		acceptLocal: (conflictId) => {
			const { mergedContent, conflicts, resolvedReplacements } = get();
			if (mergedContent === null) return;

			const conflict = conflicts.find((c) => c.id === conflictId);
			if (!conflict || conflict.resolved) return;

			const replacement = conflict.localContent;
			const newContent = resolveConflictInContent(
				mergedContent,
				conflict,
				replacement,
			);
			const updatedConflicts = markResolvedAndShiftConflicts(
				conflicts,
				conflictId,
				replacement,
			);
			if (!updatedConflicts) return;
			const updatedReplacements = updateResolvedReplacementsAfterResolve(
				resolvedReplacements,
				conflictId,
				conflict,
				replacement,
			);

			invalidateContentParse();
			set({
				mergedContent: newContent,
				conflicts: updatedConflicts,
				allResolved: checkAllResolved(updatedConflicts),
				isDirty: true,
				resolvedReplacements: updatedReplacements,
			});
		},

		acceptRemote: (conflictId) => {
			const { mergedContent, conflicts, resolvedReplacements } = get();
			if (mergedContent === null) return;

			const conflict = conflicts.find((c) => c.id === conflictId);
			if (!conflict || conflict.resolved) return;

			const replacement = conflict.remoteContent;
			const newContent = resolveConflictInContent(
				mergedContent,
				conflict,
				replacement,
			);
			const updatedConflicts = markResolvedAndShiftConflicts(
				conflicts,
				conflictId,
				replacement,
			);
			if (!updatedConflicts) return;
			const updatedReplacements = updateResolvedReplacementsAfterResolve(
				resolvedReplacements,
				conflictId,
				conflict,
				replacement,
			);

			invalidateContentParse();
			set({
				mergedContent: newContent,
				conflicts: updatedConflicts,
				allResolved: checkAllResolved(updatedConflicts),
				isDirty: true,
				resolvedReplacements: updatedReplacements,
			});
		},

		acceptBoth: (conflictId) => {
			const { mergedContent, conflicts, resolvedReplacements } = get();
			if (mergedContent === null) return;

			const conflict = conflicts.find((c) => c.id === conflictId);
			if (!conflict || conflict.resolved) return;

			const replacement = [conflict.localContent, conflict.remoteContent]
				.filter((c) => c.length > 0)
				.join("\n");
			const newContent = resolveConflictInContent(
				mergedContent,
				conflict,
				replacement,
			);
			const updatedConflicts = markResolvedAndShiftConflicts(
				conflicts,
				conflictId,
				replacement,
			);
			if (!updatedConflicts) return;
			const updatedReplacements = updateResolvedReplacementsAfterResolve(
				resolvedReplacements,
				conflictId,
				conflict,
				replacement,
			);

			invalidateContentParse();
			set({
				mergedContent: newContent,
				conflicts: updatedConflicts,
				allResolved: checkAllResolved(updatedConflicts),
				isDirty: true,
				resolvedReplacements: updatedReplacements,
			});
		},

		revertConflict: (conflictId) => {
			const { mergedContent, conflicts, resolvedReplacements } = get();
			if (mergedContent === null) return;

			const conflict = conflicts.find((c) => c.id === conflictId);
			if (!conflict?.resolved) return;

			const replacement = resolvedReplacements[conflictId];
			if (!replacement) return;

			// コンフリクトマーカーを復元する
			const markerText = buildConflictMarkerText(conflict);
			const markerLines = markerText.split("\n");
			const contentLines =
				mergedContent === "" ? [] : mergedContent.split("\n");
			const resolvedStartLine = findReplacementStartLine(
				contentLines,
				replacement,
			);
			if (resolvedStartLine === null) {
				return;
			}
			const effectiveReplacement = {
				...replacement,
				startLine: resolvedStartLine,
			};
			const startLine = effectiveReplacement.startLine;
			const endExclusive = startLine + effectiveReplacement.lineCount;
			if (
				startLine < 0 ||
				startLine > contentLines.length ||
				endExclusive > contentLines.length
			) {
				return;
			}

			const before = contentLines.slice(0, startLine);
			const after = contentLines.slice(endExclusive);
			const newContent = [...before, ...markerLines, ...after].join("\n");

			const updatedConflicts = markRevertedAndShiftConflicts(
				conflicts,
				conflict,
				effectiveReplacement,
				markerLines.length,
			);
			const updatedReplacements = updateResolvedReplacementsAfterRevert(
				resolvedReplacements,
				conflictId,
				effectiveReplacement,
				markerLines.length,
			);

			invalidateContentParse();
			set({
				mergedContent: newContent,
				conflicts: updatedConflicts,
				resolvedReplacements: updatedReplacements,
				allResolved: checkAllResolved(updatedConflicts),
				isDirty: true,
			});
		},

		updateMergedContent: (content) => {
			const requestId = ++contentParseRequestId;
			const {
				conflicts: previousConflicts,
				resolvedReplacements,
				currentConflictIndex,
			} = get();

			set({ mergedContent: content, isDirty: true });

			void (async () => {
				const parseResult = await ipc.parseConflicts(content);
				if (
					requestId !== contentParseRequestId ||
					get().mergedContent !== content
				) {
					return;
				}

				if (!parseResult.ok) {
					set({ error: parseResult.error });
					return;
				}

				const preservedResolved = preserveResolvedConflictsAfterEdit(
					previousConflicts,
					parseResult.data.conflicts,
				);
				const nextConflictState = buildConflictState(
					parseResult.data.conflicts,
					preservedResolved,
					resolvedReplacements,
					currentConflictIndex,
					content,
				);

				set(nextConflictState);
			})();
		},

		goToNextConflict: () => {
			const { conflicts, currentConflictIndex } = get();
			const unresolvedIndices = conflicts
				.map((c, i) => (!c.resolved ? i : -1))
				.filter((i) => i >= 0);
			if (unresolvedIndices.length === 0) return null;

			const nextIndex = unresolvedIndices.find((i) => i > currentConflictIndex);
			const targetIndex = nextIndex ?? unresolvedIndices[0];
			set({ currentConflictIndex: targetIndex });
			return conflicts[targetIndex].startLine;
		},

		goToPrevConflict: () => {
			const { conflicts, currentConflictIndex } = get();
			const unresolvedIndices = conflicts
				.map((c, i) => (!c.resolved ? i : -1))
				.filter((i) => i >= 0);
			if (unresolvedIndices.length === 0) return null;

			const prevIndex = [...unresolvedIndices]
				.reverse()
				.find((i) => i < currentConflictIndex);
			const targetIndex =
				prevIndex ?? unresolvedIndices[unresolvedIndices.length - 1];
			set({ currentConflictIndex: targetIndex });
			return conflicts[targetIndex].startLine;
		},

		save: async () => {
			const { mergedPath, mergedContent } = get();
			if (!mergedPath || mergedContent === null) return false;

			set({ isSaving: true, error: null });

			const result = await ipc.writeFile(mergedPath, mergedContent);
			if (result.ok) {
				// 保存中（await ipc.writeFile 中）に MERGED パネルが手動編集されると
				// updateMergedContent により mergedContent が更新され isDirty が true になる。
				// 保存した内容と最新の mergedContent を突き合わせて isDirty を再計算し、
				// 追加入力した未保存差分を isDirty: false で誤って消さない（fileStore.saveFile と同様）
				set((state) => ({
					isSaving: false,
					isDirty: state.mergedContent !== mergedContent,
				}));
				return true;
			}
			set({ error: result.error, isSaving: false });
			return false;
		},

		fetchBlame: async () => {
			const { mergedPath } = get();
			if (!mergedPath) return;

			const requestId = ++blameRequestId;
			const [localResult, remoteResult] = await Promise.all([
				ipc.gitBlameForMerge(mergedPath, "local"),
				ipc.gitBlameForMerge(mergedPath, "remote"),
			]);

			// 取得中に別の initMerge / fetchBlame が走った場合、古い応答で上書きしない。
			// mergedPath の一致も確認し、別ファイルの blame が紛れ込むのを防ぐ
			if (requestId !== blameRequestId) return;
			if (get().mergedPath !== mergedPath) return;

			if (!localResult.ok) {
				console.warn("[blame] local blame failed:", localResult.error);
			}
			if (!remoteResult.ok) {
				console.warn("[blame] remote blame failed:", remoteResult.error);
			}

			set({
				localBlame: localResult.ok ? localResult.data : null,
				remoteBlame: remoteResult.ok ? remoteResult.data : null,
			});
		},

		reloadMergedFile: async () => {
			const {
				mergedPath,
				conflicts: oldConflicts,
				resolvedReplacements,
				currentConflictIndex,
			} = get();
			if (!mergedPath) return;
			invalidateContentParse();
			const requestId = contentParseRequestId;

			// ここで isLoading を立てるとエディターが unmount され、
			// decoration と blame tooltip の参照が切れるため避ける。
			set({ error: null });

			// 再読み込み中に MERGED パネルが手動編集されると updateMergedContent が
			// contentParseRequestId を進める。各 await 後に stale を検出したら、ディスク
			// 内容での上書きも古いエラー表示も行わず即座に中断し、ユーザー入力と未保存
			// 状態（isDirty）を保持する。
			const fileResult = await ipc.readFile(mergedPath);
			if (requestId !== contentParseRequestId) return;
			if (!fileResult.ok) {
				set({ error: fileResult.error });
				return;
			}

			const parseResult = await ipc.parseConflicts(fileResult.data.content);
			if (requestId !== contentParseRequestId) return;
			if (!parseResult.ok) {
				set({ error: parseResult.error });
				return;
			}

			// 既に解決済みの装飾は維持しつつ、外部ツールで解消された未解決も反映する。
			const { preservedResolved, externallyResolved } =
				reconcileConflictsOnReload(oldConflicts, parseResult.data.conflicts);
			const nextConflictState = buildConflictState(
				parseResult.data.conflicts,
				[...preservedResolved, ...externallyResolved],
				resolvedReplacements,
				currentConflictIndex,
				fileResult.data.content,
			);

			set({
				mergedContent: fileResult.data.content,
				isDirty: false,
				...nextConflictState,
			});
		},

		clearError: () => set({ error: null }),

		checkCodexAvailable: async () => {
			const result = await ipc.checkCodexAvailable();
			if (result.ok) {
				set({ codexAvailable: result.data });
			} else {
				set({ codexAvailable: false });
			}
		},

		openCodexResolve: async () => {
			const { mergedPath } = get();
			if (!mergedPath) return;

			const result = await ipc.openCodexTerminal(mergedPath);
			if (!result.ok) {
				set({ error: result.error });
			}
		},
	};
});
