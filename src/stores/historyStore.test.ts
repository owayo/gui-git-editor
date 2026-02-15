import { beforeEach, describe, expect, it } from "vitest";
import type { RebaseEntry } from "../types/git";
import { useHistoryStore } from "./historyStore";

function makeEntry(id: string, message: string): RebaseEntry {
	return {
		id,
		command: { type: "pick" },
		commit_hash: `abc${id}`,
		message,
	};
}

describe("historyStore", () => {
	beforeEach(() => {
		useHistoryStore.getState().clear();
	});

	it("starts with empty history", () => {
		const state = useHistoryStore.getState();
		expect(state.past).toHaveLength(0);
		expect(state.future).toHaveLength(0);
		expect(state.canUndo()).toBe(false);
		expect(state.canRedo()).toBe(false);
	});

	it("pushSnapshot adds to past and clears future", () => {
		const entries = [makeEntry("1", "first")];
		useHistoryStore.getState().pushSnapshot(entries);

		const state = useHistoryStore.getState();
		expect(state.past).toHaveLength(1);
		expect(state.canUndo()).toBe(true);
	});

	it("undo returns previous entries and moves to future", () => {
		const entries1 = [makeEntry("1", "first")];
		const entries2 = [makeEntry("1", "first"), makeEntry("2", "second")];

		useHistoryStore.getState().pushSnapshot(entries1);
		useHistoryStore.getState().pushSnapshot(entries2);

		const result = useHistoryStore.getState().undo();
		expect(result).toEqual(entries1);

		const state = useHistoryStore.getState();
		expect(state.past).toHaveLength(1);
		expect(state.future).toHaveLength(1);
		expect(state.canRedo()).toBe(true);
	});

	it("undo returns null when no past exists", () => {
		const result = useHistoryStore.getState().undo();
		expect(result).toBeNull();
	});

	it("redo restores from future", () => {
		const entries1 = [makeEntry("1", "first")];
		const entries2 = [makeEntry("1", "first"), makeEntry("2", "second")];

		useHistoryStore.getState().pushSnapshot(entries1);
		useHistoryStore.getState().pushSnapshot(entries2);
		useHistoryStore.getState().undo();

		const result = useHistoryStore.getState().redo();
		expect(result).toEqual(entries2);

		const state = useHistoryStore.getState();
		expect(state.canRedo()).toBe(false);
		expect(state.canUndo()).toBe(true);
	});

	it("redo returns null when no future exists", () => {
		const result = useHistoryStore.getState().redo();
		expect(result).toBeNull();
	});

	it("pushSnapshot clears future", () => {
		const entries1 = [makeEntry("1", "first")];
		const entries2 = [makeEntry("2", "second")];
		const entries3 = [makeEntry("3", "third")];

		useHistoryStore.getState().pushSnapshot(entries1);
		useHistoryStore.getState().pushSnapshot(entries2);
		useHistoryStore.getState().undo();

		// Future should have one entry
		expect(useHistoryStore.getState().future).toHaveLength(1);

		// Push new snapshot clears future
		useHistoryStore.getState().pushSnapshot(entries3);
		expect(useHistoryStore.getState().future).toHaveLength(0);
		expect(useHistoryStore.getState().canRedo()).toBe(false);
	});

	it("respects maxHistory limit", () => {
		const store = useHistoryStore.getState();

		for (let i = 0; i < 55; i++) {
			store.pushSnapshot([makeEntry(String(i), `commit ${i}`)]);
		}

		const state = useHistoryStore.getState();
		expect(state.past.length).toBeLessThanOrEqual(state.maxHistory);
	});

	it("clear resets all history", () => {
		useHistoryStore.getState().pushSnapshot([makeEntry("1", "first")]);
		useHistoryStore.getState().pushSnapshot([makeEntry("2", "second")]);
		useHistoryStore.getState().undo();

		useHistoryStore.getState().clear();

		const state = useHistoryStore.getState();
		expect(state.past).toHaveLength(0);
		expect(state.future).toHaveLength(0);
	});

	it("deep clones entries in snapshots", () => {
		const entries = [makeEntry("1", "first")];
		useHistoryStore.getState().pushSnapshot(entries);

		// Mutate original
		entries[0].message = "mutated";

		const snapshot = useHistoryStore.getState().past[0];
		expect(snapshot.entries[0].message).toBe("first");
	});
});
