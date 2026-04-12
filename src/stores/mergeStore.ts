import { create } from "zustand";
import type { AppError } from "../types/errors";
import type { BlameLine, ConflictRegion } from "../types/git";
import * as ipc from "../types/ipc";

interface ResolvedReplacement {
	text: string;
	startLine: number;
	lineCount: number;
}

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

/**
 * 1 つのコンフリクトを、選択した置換テキストで解決する。
 */
function resolveConflictInContent(
	content: string,
	conflict: ConflictRegion,
	replacement: string,
): string {
	const lines = content.split("\n");
	const before = lines.slice(0, conflict.startLine);
	const after = lines.slice(conflict.endLine + 1);
	const replacementLines = replacement ? replacement.split("\n") : [];
	return [...before, ...replacementLines, ...after].join("\n");
}

function checkAllResolved(conflicts: ConflictRegion[]): boolean {
	return conflicts.length > 0 && conflicts.every((c) => c.resolved);
}

/**
 * 解析済みのコンフリクト内容からマーカー文字列を再構築する。
 * パーサーは接頭辞だけを見ればよいため、ラベルは汎用名を使う。
 */
function buildConflictMarkerText(conflict: ConflictRegion): string {
	if (conflict.baseContent !== null) {
		return `<<<<<<< LOCAL\n${conflict.localContent}\n||||||| BASE\n${conflict.baseContent}\n=======\n${conflict.remoteContent}\n>>>>>>> REMOTE`;
	}
	return `<<<<<<< LOCAL\n${conflict.localContent}\n=======\n${conflict.remoteContent}\n>>>>>>> REMOTE`;
}

/**
 * 再解析時に同一コンフリクトを突き合わせるための内容シグネチャを作る。
 * コンフリクト ID はパーサー依存で、除去後に再採番されうる。
 */
function getConflictSignature(conflict: ConflictRegion): string {
	return JSON.stringify({
		local: conflict.localContent,
		base: conflict.baseContent,
		remote: conflict.remoteContent,
	});
}

/**
 * 前回状態と、再解析後の未解決コンフリクトを突き合わせる。
 * - 前回未解決で今回見つからないものは外部で解決済みとみなす
 * - 前回解決済みでも今回未解決として再出現したものは古い状態を落とす
 */
function reconcileConflictsOnReload(
	oldConflicts: ConflictRegion[],
	newUnresolvedConflicts: ConflictRegion[],
): {
	preservedResolved: ConflictRegion[];
	externallyResolved: ConflictRegion[];
} {
	const remainingBySignature = new Map<string, number>();
	for (const conflict of newUnresolvedConflicts) {
		const signature = getConflictSignature(conflict);
		remainingBySignature.set(
			signature,
			(remainingBySignature.get(signature) ?? 0) + 1,
		);
	}

	const externallyResolved: ConflictRegion[] = [];
	for (const conflict of oldConflicts) {
		if (conflict.resolved) {
			continue;
		}
		const signature = getConflictSignature(conflict);
		const remaining = remainingBySignature.get(signature) ?? 0;
		if (remaining > 0) {
			remainingBySignature.set(signature, remaining - 1);
			continue;
		}
		externallyResolved.push({ ...conflict, resolved: true });
	}

	const preservedResolved: ConflictRegion[] = [];
	for (const conflict of oldConflicts) {
		if (!conflict.resolved) {
			continue;
		}
		const signature = getConflictSignature(conflict);
		const remaining = remainingBySignature.get(signature) ?? 0;
		if (remaining > 0) {
			remainingBySignature.set(signature, remaining - 1);
			continue;
		}
		preservedResolved.push(conflict);
	}

	return { preservedResolved, externallyResolved };
}

/**
 * 未解決と保持済み解決コンフリクトで ID が衝突しないようにする。
 */
function remapConflictsWithUniqueIds(
	conflicts: ConflictRegion[],
	reservedIds: Set<number>,
): ConflictRegion[] {
	let nextId =
		reservedIds.size > 0 ? Math.max(...Array.from(reservedIds)) + 1 : 0;

	return conflicts.map((conflict) => {
		if (!reservedIds.has(conflict.id)) {
			reservedIds.add(conflict.id);
			if (conflict.id >= nextId) {
				nextId = conflict.id + 1;
			}
			return conflict;
		}

		while (reservedIds.has(nextId)) {
			nextId++;
		}
		const remapped = { ...conflict, id: nextId };
		reservedIds.add(nextId);
		nextId++;
		return remapped;
	});
}

/**
 * 手動編集後、未解決として再出現していない解決済みコンフリクトだけを保持する。
 */
function preserveResolvedConflictsAfterEdit(
	oldConflicts: ConflictRegion[],
	newUnresolvedConflicts: ConflictRegion[],
): ConflictRegion[] {
	const remainingBySignature = new Map<string, number>();
	for (const conflict of newUnresolvedConflicts) {
		const signature = getConflictSignature(conflict);
		remainingBySignature.set(
			signature,
			(remainingBySignature.get(signature) ?? 0) + 1,
		);
	}

	const preservedResolved: ConflictRegion[] = [];
	for (const conflict of oldConflicts) {
		if (!conflict.resolved) {
			continue;
		}

		const signature = getConflictSignature(conflict);
		const remaining = remainingBySignature.get(signature) ?? 0;
		if (remaining > 0) {
			remainingBySignature.set(signature, remaining - 1);
			continue;
		}

		preservedResolved.push(conflict);
	}

	return preservedResolved;
}

/**
 * 現在位置に近い未解決コンフリクトの配列インデックスを返す。
 */
function getPreferredConflictIndex(
	conflicts: ConflictRegion[],
	currentConflictIndex: number,
): number {
	const unresolvedIndices = conflicts
		.map((conflict, index) => (!conflict.resolved ? index : -1))
		.filter((index) => index >= 0);

	if (unresolvedIndices.length === 0) {
		return 0;
	}

	return (
		unresolvedIndices.find((index) => index >= currentConflictIndex) ??
		unresolvedIndices[unresolvedIndices.length - 1]
	);
}

export const useMergeStore = create<MergeState>((set, get) => {
	let contentParseRequestId = 0;

	const invalidateContentParse = () => {
		contentParseRequestId += 1;
	};

	return {
		...initialState,

		initMerge: async (local, remote, base, merged) => {
			invalidateContentParse();
			set({ isLoading: true, error: null });

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
			get().fetchBlame();
		},

		acceptLocal: (conflictId) => {
			const { mergedContent, conflicts, resolvedReplacements } = get();
			if (!mergedContent) return;

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
			if (!mergedContent) return;

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
			if (!mergedContent) return;

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
			if (!mergedContent) return;

			const conflict = conflicts.find((c) => c.id === conflictId);
			if (!conflict?.resolved) return;

			const replacement = resolvedReplacements[conflictId];
			if (!replacement) return;

			// コンフリクトマーカーを復元する
			const markerText = buildConflictMarkerText(conflict);
			const markerLines = markerText.split("\n");
			const contentLines = mergedContent.split("\n");
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
				set({ isSaving: false, isDirty: false });
				return true;
			}
			set({ error: result.error, isSaving: false });
			return false;
		},

		fetchBlame: async () => {
			const { mergedPath } = get();
			if (!mergedPath) return;

			const [localResult, remoteResult] = await Promise.all([
				ipc.gitBlameForMerge(mergedPath, "local"),
				ipc.gitBlameForMerge(mergedPath, "remote"),
			]);

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

			// ここで isLoading を立てるとエディターが unmount され、
			// decoration と blame tooltip の参照が切れるため避ける。
			set({ error: null });

			const fileResult = await ipc.readFile(mergedPath);
			if (!fileResult.ok) {
				set({ error: fileResult.error });
				return;
			}

			const parseResult = await ipc.parseConflicts(fileResult.data.content);
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

/**
 * 置換テキストの行数を数える。
 * 空文字は 0 行置換として扱う。
 */
function countLines(text: string): number {
	return text === "" ? 0 : text.split("\n").length;
}

/**
 * 現在の内容の中で、解決済み置換ブロックがどこにあるかを探す。
 * 保存済みアンカーを優先し、ずれていたら最も近い完全一致へフォールバックする。
 */
function findReplacementStartLine(
	contentLines: string[],
	replacement: ResolvedReplacement,
): number | null {
	const { startLine, lineCount } = replacement;
	if (lineCount === 0) {
		return startLine >= 0 && startLine <= contentLines.length
			? startLine
			: null;
	}

	const replacementLines = replacement.text.split("\n");
	const matchesAt = (candidateStart: number): boolean => {
		if (
			candidateStart < 0 ||
			candidateStart + lineCount > contentLines.length
		) {
			return false;
		}

		for (let i = 0; i < lineCount; i++) {
			if (contentLines[candidateStart + i] !== replacementLines[i]) {
				return false;
			}
		}
		return true;
	};

	if (matchesAt(startLine)) {
		return startLine;
	}

	let nearestStart: number | null = null;
	let nearestDistance = Number.POSITIVE_INFINITY;
	for (let i = 0; i <= contentLines.length - lineCount; i++) {
		if (!matchesAt(i)) {
			continue;
		}
		const distance = Math.abs(i - startLine);
		if (distance < nearestDistance) {
			nearestDistance = distance;
			nearestStart = i;
		}
	}

	return nearestStart;
}

/**
 * 解決済み置換アンカーを現在の内容に合わせて再配置する。
 */
function relocateResolvedReplacements(
	content: string,
	replacements: Record<number, ResolvedReplacement>,
): Record<number, ResolvedReplacement> {
	const contentLines = content.split("\n");
	const relocated: Record<number, ResolvedReplacement> = {};

	for (const [idStr, replacement] of Object.entries(replacements)) {
		const relocatedStartLine = findReplacementStartLine(
			contentLines,
			replacement,
		);
		const id = Number(idStr);

		relocated[id] =
			relocatedStartLine === null
				? replacement
				: {
						...replacement,
						startLine: relocatedStartLine,
					};
	}

	return relocated;
}

/**
 * パース結果と保持対象の解決済みコンフリクトから次状態を組み立てる。
 */
function buildConflictState(
	newUnresolvedConflicts: ConflictRegion[],
	preservedResolvedConflicts: ConflictRegion[],
	resolvedReplacements: Record<number, ResolvedReplacement>,
	currentConflictIndex: number,
	content: string,
): Pick<
	MergeState,
	"conflicts" | "currentConflictIndex" | "allResolved" | "resolvedReplacements"
> {
	const remappedUnresolved = remapConflictsWithUniqueIds(
		newUnresolvedConflicts,
		new Set(preservedResolvedConflicts.map((conflict) => conflict.id)),
	);
	const mergedConflicts = [
		...remappedUnresolved,
		...preservedResolvedConflicts,
	];
	const filteredReplacements = filterResolvedReplacements(
		resolvedReplacements,
		preservedResolvedConflicts,
	);

	return {
		conflicts: mergedConflicts,
		currentConflictIndex: getPreferredConflictIndex(
			mergedConflicts,
			currentConflictIndex,
		),
		allResolved: remappedUnresolved.length === 0,
		resolvedReplacements: relocateResolvedReplacements(
			content,
			filteredReplacements,
		),
	};
}

/**
 * コンフリクトに含まれる行番号を delta 分だけ平行移動する。
 */
function shiftConflictLines(
	conflict: ConflictRegion,
	delta: number,
): ConflictRegion {
	return {
		...conflict,
		startLine: conflict.startLine + delta,
		localStartLine: conflict.localStartLine + delta,
		localEndLine: conflict.localEndLine + delta,
		baseStartLine:
			conflict.baseStartLine === null ? null : conflict.baseStartLine + delta,
		baseEndLine:
			conflict.baseEndLine === null ? null : conflict.baseEndLine + delta,
		remoteStartLine: conflict.remoteStartLine + delta,
		remoteEndLine: conflict.remoteEndLine + delta,
		endLine: conflict.endLine + delta,
	};
}

/**
 * 1 つのコンフリクトを解決済みにし、その後ろにあるコンフリクト行番号をずらす。
 */
function markResolvedAndShiftConflicts(
	oldConflicts: ConflictRegion[],
	resolvedId: number,
	replacement: string,
): ConflictRegion[] | null {
	const target = oldConflicts.find((c) => c.id === resolvedId);
	if (!target) return null;

	const removedLineCount = target.endLine - target.startLine + 1;
	const replacementLineCount = countLines(replacement);
	const delta = replacementLineCount - removedLineCount;

	return oldConflicts.map((conflict) => {
		if (conflict.id === resolvedId) {
			const resolvedEnd =
				replacementLineCount > 0
					? target.startLine + replacementLineCount - 1
					: target.startLine;
			return {
				...conflict,
				resolved: true,
				startLine: target.startLine,
				endLine: resolvedEnd,
			};
		}
		if (conflict.startLine > target.endLine) {
			return shiftConflictLines(conflict, delta);
		}
		return conflict;
	});
}

/**
 * コンフリクト解決後に、保持している置換メタデータを更新する。
 */
function updateResolvedReplacementsAfterResolve(
	oldReplacements: Record<number, ResolvedReplacement>,
	resolvedId: number,
	targetConflict: ConflictRegion,
	replacement: string,
): Record<number, ResolvedReplacement> {
	const replacementLineCount = countLines(replacement);
	const removedLineCount =
		targetConflict.endLine - targetConflict.startLine + 1;
	const delta = replacementLineCount - removedLineCount;
	const updated: Record<number, ResolvedReplacement> = {};

	for (const [idStr, meta] of Object.entries(oldReplacements)) {
		const id = Number(idStr);
		updated[id] =
			meta.startLine > targetConflict.endLine
				? { ...meta, startLine: meta.startLine + delta }
				: meta;
	}

	updated[resolvedId] = {
		text: replacement,
		startLine: targetConflict.startLine,
		lineCount: replacementLineCount,
	};

	return updated;
}

/**
 * revert 後に復元されるコンフリクトブロックの行情報を再構築する。
 */
function buildRevertedConflict(
	conflict: ConflictRegion,
	startLine: number,
): ConflictRegion {
	const localLineCount = countLines(conflict.localContent);
	const remoteLineCount = countLines(conflict.remoteContent);
	const localStartLine = startLine + 1;
	const localEndLine = localStartLine + localLineCount;
	if (conflict.baseContent !== null) {
		const baseLineCount = countLines(conflict.baseContent);
		const baseStartLine = localEndLine + 1;
		const baseEndLine = baseStartLine + baseLineCount;
		const remoteStartLine = baseEndLine + 1;
		const remoteEndLine = remoteStartLine + remoteLineCount;
		return {
			...conflict,
			resolved: false,
			startLine,
			localStartLine,
			localEndLine,
			baseStartLine,
			baseEndLine,
			remoteStartLine,
			remoteEndLine,
			endLine: remoteEndLine,
		};
	}

	const remoteStartLine = localEndLine + 1;
	const remoteEndLine = remoteStartLine + remoteLineCount;

	return {
		...conflict,
		resolved: false,
		startLine,
		localStartLine,
		localEndLine,
		baseStartLine: null,
		baseEndLine: null,
		remoteStartLine,
		remoteEndLine,
		endLine: remoteEndLine,
	};
}

/**
 * 1 つのコンフリクトを未解決に戻し、その後続コンフリクトの行番号をずらす。
 */
function markRevertedAndShiftConflicts(
	oldConflicts: ConflictRegion[],
	target: ConflictRegion,
	replacement: ResolvedReplacement,
	markerLineCount: number,
): ConflictRegion[] {
	const removedEnd = replacement.startLine + replacement.lineCount - 1;
	const delta = markerLineCount - replacement.lineCount;

	return oldConflicts.map((conflict) => {
		if (conflict.id === target.id) {
			return buildRevertedConflict(conflict, replacement.startLine);
		}
		if (conflict.startLine > removedEnd) {
			return shiftConflictLines(conflict, delta);
		}
		return conflict;
	});
}

/**
 * revert されたコンフリクトのメタデータを消し、残りのアンカーをずらす。
 */
function updateResolvedReplacementsAfterRevert(
	oldReplacements: Record<number, ResolvedReplacement>,
	revertedId: number,
	replacement: ResolvedReplacement,
	markerLineCount: number,
): Record<number, ResolvedReplacement> {
	const removedEnd = replacement.startLine + replacement.lineCount - 1;
	const delta = markerLineCount - replacement.lineCount;
	const updated: Record<number, ResolvedReplacement> = {};

	for (const [idStr, meta] of Object.entries(oldReplacements)) {
		const id = Number(idStr);
		if (id === revertedId) {
			continue;
		}
		updated[id] =
			meta.startLine > removedEnd
				? { ...meta, startLine: meta.startLine + delta }
				: meta;
	}

	return updated;
}

/**
 * 現在も保持対象の解決済みコンフリクトに対応するアンカーだけを残す。
 */
function filterResolvedReplacements(
	oldReplacements: Record<number, ResolvedReplacement>,
	preservedResolvedConflicts: ConflictRegion[],
): Record<number, ResolvedReplacement> {
	const preservedIds = new Set(preservedResolvedConflicts.map((c) => c.id));
	const filtered: Record<number, ResolvedReplacement> = {};

	for (const [idStr, meta] of Object.entries(oldReplacements)) {
		const id = Number(idStr);
		if (preservedIds.has(id)) {
			filtered[id] = meta;
		}
	}

	return filtered;
}
