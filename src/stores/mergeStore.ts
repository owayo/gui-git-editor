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

	// Branch labels
	localLabel: string;
	remoteLabel: string;

	// Codex state
	codexAvailable: boolean | null;

	// Stores replacement text per conflict for revert support
	resolvedReplacements: Record<number, string>;

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
	revertConflict: (conflictId: number) => void;
	updateMergedContent: (content: string) => void;
	goToNextConflict: () => number | null;
	goToPrevConflict: () => number | null;
	save: () => Promise<boolean>;
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
	resolvedReplacements: {} as Record<number, string>,
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
			localLabel: files.localLabel,
			remoteLabel: files.remoteLabel,
			conflicts: parseResult.data.conflicts,
			currentConflictIndex: 0,
			allResolved: !parseResult.data.hasConflicts,
			isLoading: false,
			isDirty: false,
		});
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
			resolvedReplacements: {
				...resolvedReplacements,
				[conflictId]: replacement,
			},
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
			resolvedReplacements: {
				...resolvedReplacements,
				[conflictId]: replacement,
			},
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
			resolvedReplacements: {
				...resolvedReplacements,
				[conflictId]: replacement,
			},
		});
	},

	revertConflict: (conflictId) => {
		const { mergedContent, conflicts, resolvedReplacements } = get();
		if (!mergedContent) return;

		const conflict = conflicts.find((c) => c.id === conflictId);
		if (!conflict || !conflict.resolved) return;

		const replacement = resolvedReplacements[conflictId];
		if (replacement === undefined) return;

		// Reconstruct conflict markers
		const markerText = `<<<<<<< LOCAL\n${conflict.localContent}\n=======\n${conflict.remoteContent}\n>>>>>>> REMOTE`;

		// Find the replacement text in content and replace with markers
		const replacementLines = replacement.split("\n");
		const markerLines = markerText.split("\n");
		const contentLines = mergedContent.split("\n");

		let newContent: string | null = null;

		for (let i = 0; i <= contentLines.length - replacementLines.length; i++) {
			let match = true;
			for (let j = 0; j < replacementLines.length; j++) {
				if (contentLines[i + j] !== replacementLines[j]) {
					match = false;
					break;
				}
			}
			if (match) {
				const before = contentLines.slice(0, i);
				const after = contentLines.slice(i + replacementLines.length);
				newContent = [...before, ...markerLines, ...after].join("\n");
				break;
			}
		}

		if (newContent === null) return;

		// Remove from resolvedReplacements
		const { [conflictId]: _, ...remainingReplacements } = resolvedReplacements;

		const updatedConflicts = conflicts.map((c) =>
			c.id === conflictId ? { ...c, resolved: false } : c,
		);

		set({
			mergedContent: newContent,
			conflicts: updatedConflicts,
			resolvedReplacements: remainingReplacements,
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
		const { mergedPath, conflicts: oldConflicts, resolvedReplacements } = get();
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

		// Preserve previously resolved conflicts so their red background persists.
		// Fresh parse only returns unresolved conflicts (those still with markers).
		const oldResolved = oldConflicts.filter((c) => c.resolved);
		const mergedConflicts = [...parseResult.data.conflicts, ...oldResolved];
		const hasUnresolved = parseResult.data.hasConflicts;

		set({
			mergedContent: fileResult.data.content,
			conflicts: mergedConflicts,
			currentConflictIndex: 0,
			allResolved:
				!hasUnresolved && oldResolved.length > 0
					? checkAllResolved(mergedConflicts)
					: !hasUnresolved,
			isLoading: false,
			isDirty: false,
			resolvedReplacements,
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
