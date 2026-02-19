import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RebaseEntry } from "../types/git";
import { useRebaseStore } from "./rebaseStore";

// Mock IPC module
vi.mock("../types/ipc", () => ({
	parseRebaseTodo: vi.fn(),
	serializeRebaseTodo: vi.fn(),
}));

function makeEntry(
	id: string,
	command: RebaseEntry["command"] = { type: "pick" },
	message = `commit ${id}`,
): RebaseEntry {
	return { id, command, commit_hash: `abc${id}`, message };
}

describe("rebaseStore", () => {
	beforeEach(() => {
		useRebaseStore.getState().reset();
	});

	describe("initial state", () => {
		it("should have empty entries", () => {
			const state = useRebaseStore.getState();
			expect(state.entries).toEqual([]);
			expect(state.originalEntries).toEqual([]);
			expect(state.comments).toEqual([]);
			expect(state.selectedEntryId).toBeNull();
			expect(state.isLoading).toBe(false);
			expect(state.error).toBeNull();
			expect(state.isDirty).toBe(false);
		});
	});

	describe("setEntries", () => {
		it("should set entries and mark dirty", () => {
			const entries = [makeEntry("1"), makeEntry("2")];
			useRebaseStore.getState().setEntries(entries);

			const state = useRebaseStore.getState();
			expect(state.entries).toEqual(entries);
			expect(state.isDirty).toBe(true);
		});
	});

	describe("updateEntryCommand", () => {
		it("should update command for specific entry", () => {
			useRebaseStore.getState().setEntries([makeEntry("1"), makeEntry("2")]);
			useRebaseStore.getState().updateEntryCommand("1", { type: "reword" });

			const entry = useRebaseStore.getState().entries[0];
			expect(entry.command).toEqual({ type: "reword" });
		});

		it("should not modify other entries", () => {
			useRebaseStore.getState().setEntries([makeEntry("1"), makeEntry("2")]);
			useRebaseStore.getState().updateEntryCommand("1", { type: "reword" });

			const entry2 = useRebaseStore.getState().entries[1];
			expect(entry2.command).toEqual({ type: "pick" });
		});
	});

	describe("updateEntryMessage", () => {
		it("should update message for specific entry", () => {
			useRebaseStore.getState().setEntries([makeEntry("1")]);
			useRebaseStore.getState().updateEntryMessage("1", "new message");

			expect(useRebaseStore.getState().entries[0].message).toBe("new message");
			expect(useRebaseStore.getState().isDirty).toBe(true);
		});
	});

	describe("moveEntry", () => {
		it("should move entry from one position to another", () => {
			const entries = [makeEntry("1"), makeEntry("2"), makeEntry("3")];
			useRebaseStore.getState().setEntries(entries);
			useRebaseStore.getState().moveEntry(0, 2);

			const ids = useRebaseStore.getState().entries.map((e) => e.id);
			expect(ids).toEqual(["2", "3", "1"]);
		});
	});

	describe("selectEntry", () => {
		it("should set selected entry id", () => {
			useRebaseStore.getState().selectEntry("test-id");
			expect(useRebaseStore.getState().selectedEntryId).toBe("test-id");
		});

		it("should accept null to deselect", () => {
			useRebaseStore.getState().selectEntry("test-id");
			useRebaseStore.getState().selectEntry(null);
			expect(useRebaseStore.getState().selectedEntryId).toBeNull();
		});
	});

	describe("getEntry", () => {
		it("should return the entry with given id", () => {
			const entries = [makeEntry("1"), makeEntry("2")];
			useRebaseStore.getState().setEntries(entries);

			const entry = useRebaseStore.getState().getEntry("2");
			expect(entry?.id).toBe("2");
		});

		it("should return undefined for non-existent id", () => {
			useRebaseStore.getState().setEntries([makeEntry("1")]);
			expect(useRebaseStore.getState().getEntry("999")).toBeUndefined();
		});
	});

	describe("getSelectedEntry", () => {
		it("should return the selected entry", () => {
			const entries = [makeEntry("1"), makeEntry("2")];
			useRebaseStore.getState().setEntries(entries);
			useRebaseStore.getState().selectEntry("2");

			const selected = useRebaseStore.getState().getSelectedEntry();
			expect(selected?.id).toBe("2");
		});

		it("should return undefined when nothing selected", () => {
			useRebaseStore.getState().setEntries([makeEntry("1")]);
			expect(useRebaseStore.getState().getSelectedEntry()).toBeUndefined();
		});
	});

	describe("getValidationError", () => {
		it("should return null for empty entries", () => {
			expect(useRebaseStore.getState().getValidationError()).toBeNull();
		});

		it("should return null for valid entries starting with pick", () => {
			useRebaseStore
				.getState()
				.setEntries([
					makeEntry("1", { type: "pick" }),
					makeEntry("2", { type: "squash" }),
				]);
			expect(useRebaseStore.getState().getValidationError()).toBeNull();
		});

		it("should return error when first non-drop entry is squash", () => {
			useRebaseStore
				.getState()
				.setEntries([
					makeEntry("1", { type: "drop" }),
					makeEntry("2", { type: "squash" }),
				]);
			expect(useRebaseStore.getState().getValidationError()).not.toBeNull();
		});

		it("should return error when first entry is fixup", () => {
			useRebaseStore.getState().setEntries([makeEntry("1", { type: "fixup" })]);
			expect(useRebaseStore.getState().getValidationError()).not.toBeNull();
		});

		it("should allow drop entries before pick", () => {
			useRebaseStore
				.getState()
				.setEntries([
					makeEntry("1", { type: "drop" }),
					makeEntry("2", { type: "pick" }),
					makeEntry("3", { type: "squash" }),
				]);
			expect(useRebaseStore.getState().getValidationError()).toBeNull();
		});
	});

	describe("setSimpleCommand", () => {
		it("should update entry command via setSimpleCommand", () => {
			useRebaseStore.getState().setEntries([makeEntry("1")]);
			useRebaseStore.getState().setSimpleCommand("1", "reword");

			expect(useRebaseStore.getState().entries[0].command).toEqual({
				type: "reword",
			});
		});
	});

	describe("dropEntry / undropEntry", () => {
		it("should set command to drop", () => {
			useRebaseStore.getState().setEntries([makeEntry("1")]);
			useRebaseStore.getState().dropEntry("1");

			expect(useRebaseStore.getState().entries[0].command).toEqual({
				type: "drop",
			});
		});

		it("should set command to pick", () => {
			useRebaseStore.getState().setEntries([makeEntry("1", { type: "drop" })]);
			useRebaseStore.getState().undropEntry("1");

			expect(useRebaseStore.getState().entries[0].command).toEqual({
				type: "pick",
			});
		});
	});

	describe("squashAll", () => {
		it("should keep first entry unchanged and set rest to fixup", () => {
			useRebaseStore
				.getState()
				.setEntries([makeEntry("1"), makeEntry("2"), makeEntry("3")]);
			useRebaseStore.getState().squashAll();

			const entries = useRebaseStore.getState().entries;
			expect(entries[0].command).toEqual({ type: "pick" });
			expect(entries[1].command).toEqual({ type: "fixup" });
			expect(entries[2].command).toEqual({ type: "fixup" });
		});
	});

	describe("clearError", () => {
		it("should clear the error state", () => {
			// Force an error state
			useRebaseStore.setState({ error: { message: "test error" } as never });
			useRebaseStore.getState().clearError();
			expect(useRebaseStore.getState().error).toBeNull();
		});
	});

	describe("reset", () => {
		it("should reset to initial state", () => {
			useRebaseStore.getState().setEntries([makeEntry("1")]);
			useRebaseStore.getState().selectEntry("1");
			useRebaseStore.getState().reset();

			const state = useRebaseStore.getState();
			expect(state.entries).toEqual([]);
			expect(state.selectedEntryId).toBeNull();
			expect(state.isDirty).toBe(false);
		});
	});
});
