import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trailer } from "../types/git";
import { useCommitStore } from "./commitStore";

// Mock IPC module
vi.mock("../types/ipc", () => ({
	parseCommitMsg: vi.fn(),
	serializeCommitMsg: vi.fn(),
	validateCommitMsg: vi.fn(),
}));

import * as ipc from "../types/ipc";

const mockedIpc = vi.mocked(ipc);

describe("commitStore", () => {
	beforeEach(() => {
		useCommitStore.getState().reset();
		vi.clearAllMocks();
	});

	describe("initial state", () => {
		it("should have empty initial state", () => {
			const state = useCommitStore.getState();
			expect(state.subject).toBe("");
			expect(state.body).toBe("");
			expect(state.trailers).toEqual([]);
			expect(state.comments).toEqual([]);
			expect(state.diffContent).toBeNull();
			expect(state.validation).toBeNull();
			expect(state.isLoading).toBe(false);
			expect(state.error).toBeNull();
			expect(state.isDirty).toBe(false);
		});
	});

	describe("setSubject", () => {
		it("should update subject", () => {
			mockedIpc.validateCommitMsg.mockResolvedValue({
				ok: true,
				data: {
					is_valid: true,
					subject_too_long: false,
					subject_length: 5,
					long_body_lines: [],
				},
			});
			useCommitStore.getState().setSubject("test subject");
			expect(useCommitStore.getState().subject).toBe("test subject");
		});

		it("should mark dirty when subject differs from original", () => {
			mockedIpc.validateCommitMsg.mockResolvedValue({
				ok: true,
				data: {
					is_valid: true,
					subject_too_long: false,
					subject_length: 0,
					long_body_lines: [],
				},
			});
			useCommitStore.setState({ originalSubject: "original" });
			useCommitStore.getState().setSubject("changed");
			expect(useCommitStore.getState().isDirty).toBe(true);
		});

		it("should not be dirty when subject matches original", () => {
			mockedIpc.validateCommitMsg.mockResolvedValue({
				ok: true,
				data: {
					is_valid: true,
					subject_too_long: false,
					subject_length: 8,
					long_body_lines: [],
				},
			});
			useCommitStore.setState({
				originalSubject: "original",
				originalBody: "",
				body: "",
			});
			useCommitStore.getState().setSubject("original");
			expect(useCommitStore.getState().isDirty).toBe(false);
		});
	});

	describe("setBody", () => {
		it("should update body", () => {
			mockedIpc.validateCommitMsg.mockResolvedValue({
				ok: true,
				data: {
					is_valid: true,
					subject_too_long: false,
					subject_length: 0,
					long_body_lines: [],
				},
			});
			useCommitStore.getState().setBody("test body");
			expect(useCommitStore.getState().body).toBe("test body");
		});

		it("should mark dirty when body differs from original", () => {
			mockedIpc.validateCommitMsg.mockResolvedValue({
				ok: true,
				data: {
					is_valid: true,
					subject_too_long: false,
					subject_length: 0,
					long_body_lines: [],
				},
			});
			useCommitStore.setState({ originalBody: "original" });
			useCommitStore.getState().setBody("changed");
			expect(useCommitStore.getState().isDirty).toBe(true);
		});
	});

	describe("getMessage", () => {
		it("should return current commit message state", () => {
			useCommitStore.setState({
				subject: "feat: add feature",
				body: "description",
				trailers: [{ key: "Signed-off-by", value: "Test" }],
				comments: ["# comment"],
				diffContent: "diff content",
			});

			const msg = useCommitStore.getState().getMessage();
			expect(msg.subject).toBe("feat: add feature");
			expect(msg.body).toBe("description");
			expect(msg.trailers).toEqual([{ key: "Signed-off-by", value: "Test" }]);
			expect(msg.comments).toEqual(["# comment"]);
			expect(msg.diff_content).toBe("diff content");
		});
	});

	describe("trailer operations", () => {
		const trailer: Trailer = { key: "Signed-off-by", value: "Test User" };

		it("addTrailer should append a trailer", () => {
			useCommitStore.getState().addTrailer(trailer);
			expect(useCommitStore.getState().trailers).toEqual([trailer]);
		});

		it("addTrailer should append multiple trailers", () => {
			const trailer2: Trailer = { key: "Co-authored-by", value: "Other" };
			useCommitStore.getState().addTrailer(trailer);
			useCommitStore.getState().addTrailer(trailer2);
			expect(useCommitStore.getState().trailers).toHaveLength(2);
		});

		it("removeTrailer should remove trailer at index", () => {
			const trailer2: Trailer = { key: "Co-authored-by", value: "Other" };
			useCommitStore.getState().addTrailer(trailer);
			useCommitStore.getState().addTrailer(trailer2);
			useCommitStore.getState().removeTrailer(0);

			expect(useCommitStore.getState().trailers).toEqual([trailer2]);
		});

		it("updateTrailer should update trailer at index", () => {
			useCommitStore.getState().addTrailer(trailer);
			const updated: Trailer = {
				key: "Signed-off-by",
				value: "Updated User",
			};
			useCommitStore.getState().updateTrailer(0, updated);

			expect(useCommitStore.getState().trailers[0]).toEqual(updated);
		});
	});

	describe("parseContent", () => {
		it("should parse content successfully", async () => {
			mockedIpc.parseCommitMsg.mockResolvedValue({
				ok: true,
				data: {
					subject: "feat: test",
					body: "body text",
					trailers: [],
					comments: [],
					diff_content: null,
				},
			});
			mockedIpc.validateCommitMsg.mockResolvedValue({
				ok: true,
				data: {
					is_valid: true,
					subject_too_long: false,
					subject_length: 10,
					long_body_lines: [],
				},
			});

			const result = await useCommitStore.getState().parseContent("content");
			expect(result).toBe(true);
			expect(useCommitStore.getState().subject).toBe("feat: test");
			expect(useCommitStore.getState().body).toBe("body text");
			expect(useCommitStore.getState().isLoading).toBe(false);
		});

		it("should handle parse error", async () => {
			mockedIpc.parseCommitMsg.mockResolvedValue({
				ok: false,
				error: { message: "parse failed" } as never,
			});

			const result = await useCommitStore.getState().parseContent("bad");
			expect(result).toBe(false);
			expect(useCommitStore.getState().error).toBeTruthy();
			expect(useCommitStore.getState().isLoading).toBe(false);
		});
	});

	describe("serialize", () => {
		it("should serialize successfully", async () => {
			mockedIpc.serializeCommitMsg.mockResolvedValue({
				ok: true,
				data: "serialized content",
			});

			const result = await useCommitStore.getState().serialize();
			expect(result).toBe("serialized content");
		});

		it("should return null on error", async () => {
			mockedIpc.serializeCommitMsg.mockResolvedValue({
				ok: false,
				error: { message: "serialize failed" } as never,
			});

			const result = await useCommitStore.getState().serialize();
			expect(result).toBeNull();
			expect(useCommitStore.getState().error).toBeTruthy();
		});
	});

	describe("clearError", () => {
		it("should clear the error state", () => {
			useCommitStore.setState({ error: { message: "test" } as never });
			useCommitStore.getState().clearError();
			expect(useCommitStore.getState().error).toBeNull();
		});
	});

	describe("reset", () => {
		it("should reset to initial state", () => {
			useCommitStore.setState({
				subject: "test",
				body: "body",
				isDirty: true,
			});
			useCommitStore.getState().reset();

			const state = useCommitStore.getState();
			expect(state.subject).toBe("");
			expect(state.body).toBe("");
			expect(state.isDirty).toBe(false);
		});
	});

	describe("validate request-ID guard", () => {
		// ヘルパー: 手動で解決できる deferred promise を作成
		function deferred<T>() {
			let resolve!: (value: T) => void;
			const promise = new Promise<T>((r) => {
				resolve = r;
			});
			return { promise, resolve };
		}

		type ValidateResult = Awaited<ReturnType<typeof ipc.validateCommitMsg>>;

		it("古い validate 応答は破棄される", async () => {
			const first = deferred<ValidateResult>();
			const second = deferred<ValidateResult>();

			// 1回目 → first、2回目 → second を返す
			mockedIpc.validateCommitMsg
				.mockReturnValueOnce(first.promise as never)
				.mockReturnValueOnce(second.promise as never);

			// validate を連続で2回呼ぶ
			const p1 = useCommitStore.getState().validate();
			const p2 = useCommitStore.getState().validate();

			// 2回目を先に解決（最新のリクエスト）
			second.resolve({
				ok: true,
				data: {
					is_valid: true,
					subject_too_long: false,
					subject_length: 5,
					long_body_lines: [],
				},
			});
			await p2;

			expect(useCommitStore.getState().validation).toEqual({
				is_valid: true,
				subject_too_long: false,
				subject_length: 5,
				long_body_lines: [],
			});

			// 1回目を後から解決（古いリクエスト → 無視されるべき）
			first.resolve({
				ok: true,
				data: {
					is_valid: false,
					subject_too_long: true,
					subject_length: 100,
					long_body_lines: [
						[1, 80],
						[2, 90],
						[3, 85],
					],
				},
			});
			await p1;

			// 古い応答で上書きされていないことを確認
			expect(useCommitStore.getState().validation).toEqual({
				is_valid: true,
				subject_too_long: false,
				subject_length: 5,
				long_body_lines: [],
			});
		});

		it("単発の validate リクエストは正常に適用される", async () => {
			mockedIpc.validateCommitMsg.mockResolvedValue({
				ok: true,
				data: {
					is_valid: false,
					subject_too_long: true,
					subject_length: 80,
					long_body_lines: [[5, 100]],
				},
			});

			await useCommitStore.getState().validate();

			expect(useCommitStore.getState().validation).toEqual({
				is_valid: false,
				subject_too_long: true,
				subject_length: 80,
				long_body_lines: [[5, 100]],
			});
		});

		it("連続 setSubject で最後の validate 結果のみ反映される", async () => {
			const deferreds = [
				deferred<ValidateResult>(),
				deferred<ValidateResult>(),
				deferred<ValidateResult>(),
			];

			mockedIpc.validateCommitMsg
				.mockReturnValueOnce(deferreds[0].promise as never)
				.mockReturnValueOnce(deferreds[1].promise as never)
				.mockReturnValueOnce(deferreds[2].promise as never);

			// setSubject を3回連続で呼ぶ（それぞれ validate() を発火する）
			useCommitStore.getState().setSubject("a");
			useCommitStore.getState().setSubject("ab");
			useCommitStore.getState().setSubject("abc");

			expect(mockedIpc.validateCommitMsg).toHaveBeenCalledTimes(3);

			// 逆順で解決（3回目 → 1回目 → 2回目）
			deferreds[2].resolve({
				ok: true,
				data: {
					is_valid: true,
					subject_too_long: false,
					subject_length: 3,
					long_body_lines: [],
				},
			});
			// 最新の応答が反映されるのを待つ
			await vi.waitFor(() => {
				expect(useCommitStore.getState().validation).toEqual({
					is_valid: true,
					subject_too_long: false,
					subject_length: 3,
					long_body_lines: [],
				});
			});

			// 古い応答を解決
			deferreds[0].resolve({
				ok: true,
				data: {
					is_valid: false,
					subject_too_long: true,
					subject_length: 1,
					long_body_lines: [[99, 120]],
				},
			});
			deferreds[1].resolve({
				ok: true,
				data: {
					is_valid: false,
					subject_too_long: true,
					subject_length: 2,
					long_body_lines: [[50, 90]],
				},
			});
			// microtask を消化
			await new Promise((r) => setTimeout(r, 0));

			// 最後の結果のみが残っていることを確認
			expect(useCommitStore.getState().validation).toEqual({
				is_valid: true,
				subject_too_long: false,
				subject_length: 3,
				long_body_lines: [],
			});
		});
	});
});
