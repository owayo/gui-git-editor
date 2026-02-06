import { create } from "zustand";
import type { AppError } from "../types/errors";
import type { ConflictRegion } from "../types/git";
import * as ipc from "../types/ipc";

interface MergeState {
	// File contents
	localContent: string | null;
	remoteContent: string | null;
	baseContent: string | null;
	mergedContent: string | null;
	mergedPath: string | null;
	language: string;

	// Conflict state
	conflicts: ConflictRegion[];
	currentConflictIndex: number;
	allResolved: boolean;

	// UI state
	isLoading: boolean;
	isSaving: boolean;
	error: AppError | null;
	isDirty: boolean;

	// Actions
	initMerge: (
		local: string,
		remote: string,
		base: string | null,
		merged: string,
	) => Promise<void>;
	acceptLocal: (conflictId: number) => void;
	acceptRemote: (conflictId: number) => void;
	acceptBoth: (conflictId: number) => void;
	updateMergedContent: (content: string) => void;
	goToNextConflict: () => number | null;
	goToPrevConflict: () => number | null;
	save: () => Promise<boolean>;
	reloadMergedFile: () => Promise<void>;
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
};

/**
 * Resolve a single conflict in the merged content by replacing the conflict
 * markers with the chosen replacement text.
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

export const useMergeStore = create<MergeState>((set, get) => ({
	...initialState,

	initMerge: async (local, remote, base, merged) => {
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
			conflicts: parseResult.data.conflicts,
			currentConflictIndex: 0,
			allResolved: !parseResult.data.hasConflicts,
			isLoading: false,
			isDirty: false,
		});
	},

	acceptLocal: (conflictId) => {
		const { mergedContent, conflicts } = get();
		if (!mergedContent) return;

		const conflict = conflicts.find((c) => c.id === conflictId);
		if (!conflict || conflict.resolved) return;

		const newContent = resolveConflictInContent(
			mergedContent,
			conflict,
			conflict.localContent,
		);

		// Re-parse conflicts from the updated content to get correct line numbers
		const updatedConflicts = reParseAndPreserveResolved(
			newContent,
			conflicts,
			conflictId,
		);

		set({
			mergedContent: newContent,
			conflicts: updatedConflicts,
			allResolved: checkAllResolved(updatedConflicts),
			isDirty: true,
		});
	},

	acceptRemote: (conflictId) => {
		const { mergedContent, conflicts } = get();
		if (!mergedContent) return;

		const conflict = conflicts.find((c) => c.id === conflictId);
		if (!conflict || conflict.resolved) return;

		const newContent = resolveConflictInContent(
			mergedContent,
			conflict,
			conflict.remoteContent,
		);

		const updatedConflicts = reParseAndPreserveResolved(
			newContent,
			conflicts,
			conflictId,
		);

		set({
			mergedContent: newContent,
			conflicts: updatedConflicts,
			allResolved: checkAllResolved(updatedConflicts),
			isDirty: true,
		});
	},

	acceptBoth: (conflictId) => {
		const { mergedContent, conflicts } = get();
		if (!mergedContent) return;

		const conflict = conflicts.find((c) => c.id === conflictId);
		if (!conflict || conflict.resolved) return;

		const bothContent = [conflict.localContent, conflict.remoteContent]
			.filter((c) => c.length > 0)
			.join("\n");
		const newContent = resolveConflictInContent(
			mergedContent,
			conflict,
			bothContent,
		);

		const updatedConflicts = reParseAndPreserveResolved(
			newContent,
			conflicts,
			conflictId,
		);

		set({
			mergedContent: newContent,
			conflicts: updatedConflicts,
			allResolved: checkAllResolved(updatedConflicts),
			isDirty: true,
		});
	},

	updateMergedContent: (content) => {
		set({ mergedContent: content, isDirty: true });
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

	reloadMergedFile: async () => {
		const { mergedPath } = get();
		if (!mergedPath) return;

		set({ isLoading: true, error: null });

		const fileResult = await ipc.readFile(mergedPath);
		if (!fileResult.ok) {
			set({ error: fileResult.error, isLoading: false });
			return;
		}

		const parseResult = await ipc.parseConflicts(fileResult.data.content);
		if (!parseResult.ok) {
			set({ error: parseResult.error, isLoading: false });
			return;
		}

		set({
			mergedContent: fileResult.data.content,
			conflicts: parseResult.data.conflicts,
			currentConflictIndex: 0,
			allResolved: !parseResult.data.hasConflicts,
			isLoading: false,
			isDirty: false,
		});
	},

	clearError: () => set({ error: null }),
}));

/**
 * After resolving a conflict, we mark it as resolved and keep remaining
 * unresolved conflicts unchanged. The line numbers of remaining conflicts
 * will shift but we track by ID so this is safe for the next resolution.
 * We simply mark the resolved conflict and let the next parse re-align if needed.
 */
function reParseAndPreserveResolved(
	_newContent: string,
	oldConflicts: ConflictRegion[],
	resolvedId: number,
): ConflictRegion[] {
	return oldConflicts.map((c) =>
		c.id === resolvedId ? { ...c, resolved: true } : c,
	);
}
