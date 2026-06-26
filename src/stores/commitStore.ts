import { create } from "zustand";
import type { AppError } from "../types/errors";
import type { CommitMessage, CommitValidation, Trailer } from "../types/git";
import * as ipc from "../types/ipc";

interface CommitState {
	// 状態。
	subject: string;
	body: string;
	trailers: Trailer[];
	comments: string[];
	diffContent: string | null;
	validation: CommitValidation | null;
	isLoading: boolean;
	error: AppError | null;
	isDirty: boolean;
	originalSubject: string;
	originalBody: string;
	originalTrailers: Trailer[];

	// 派生値。
	getMessage: () => CommitMessage;

	// 操作。
	parseContent: (content: string) => Promise<boolean>;
	serialize: () => Promise<string | null>;
	setSubject: (subject: string) => void;
	setBody: (body: string) => void;
	addTrailer: (trailer: Trailer) => void;
	removeTrailer: (index: number) => void;
	updateTrailer: (index: number, trailer: Trailer) => void;
	validate: () => Promise<void>;
	clearError: () => void;
	reset: () => void;
}

// trailer 配列が一致するか判定する（subject/body と併せて dirty 判定に使う）
const trailersEqual = (a: Trailer[], b: Trailer[]): boolean =>
	a.length === b.length &&
	a.every((t, i) => t.key === b[i].key && t.value === b[i].value);

// subject / body / trailers のいずれかが初期値から変化したかを判定する
const computeDirty = (s: {
	subject: string;
	body: string;
	trailers: Trailer[];
	originalSubject: string;
	originalBody: string;
	originalTrailers: Trailer[];
}): boolean =>
	s.subject !== s.originalSubject ||
	s.body !== s.originalBody ||
	!trailersEqual(s.trailers, s.originalTrailers);

const initialState = {
	subject: "",
	body: "",
	trailers: [] as Trailer[],
	comments: [] as string[],
	diffContent: null as string | null,
	validation: null as CommitValidation | null,
	isLoading: false,
	error: null as AppError | null,
	isDirty: false,
	originalSubject: "",
	originalBody: "",
	originalTrailers: [] as Trailer[],
};

export const useCommitStore = create<CommitState>((set, get) => {
	// validate の非同期応答が古い結果で上書きされないよう request-ID で突き合わせる
	let validateRequestId = 0;

	return {
		...initialState,

		getMessage: () => ({
			subject: get().subject,
			body: get().body,
			trailers: get().trailers,
			comments: get().comments,
			diff_content: get().diffContent,
		}),

		parseContent: async (content: string) => {
			set({ isLoading: true, error: null });

			const result = await ipc.parseCommitMsg(content);

			if (result.ok) {
				const msg = result.data;
				set({
					subject: msg.subject,
					body: msg.body,
					trailers: msg.trailers,
					comments: msg.comments,
					diffContent: msg.diff_content,
					isLoading: false,
					isDirty: false,
					originalSubject: msg.subject,
					originalBody: msg.body,
					originalTrailers: msg.trailers,
				});
				// 解析後に検証する。
				await get().validate();
				return true;
			} else {
				set({
					error: result.error,
					isLoading: false,
				});
				return false;
			}
		},

		serialize: async () => {
			const message = get().getMessage();
			const result = await ipc.serializeCommitMsg(message);

			if (result.ok) {
				return result.data;
			} else {
				set({ error: result.error });
				return null;
			}
		},

		setSubject: (subject: string) => {
			set((state) => ({
				subject,
				isDirty: computeDirty({ ...state, subject }),
			}));
			// 本番では debounce した検証が望ましい。
			get().validate();
		},

		setBody: (body: string) => {
			set((state) => ({
				body,
				isDirty: computeDirty({ ...state, body }),
			}));
			get().validate();
		},

		addTrailer: (trailer: Trailer) => {
			set((state) => {
				const trailers = [...state.trailers, trailer];
				return { trailers, isDirty: computeDirty({ ...state, trailers }) };
			});
		},

		removeTrailer: (index: number) => {
			set((state) => {
				const trailers = state.trailers.filter((_, i) => i !== index);
				return { trailers, isDirty: computeDirty({ ...state, trailers }) };
			});
		},

		updateTrailer: (index: number, trailer: Trailer) => {
			set((state) => {
				const trailers = state.trailers.map((t, i) =>
					i === index ? trailer : t,
				);
				return { trailers, isDirty: computeDirty({ ...state, trailers }) };
			});
		},

		validate: async () => {
			const requestId = ++validateRequestId;
			const message = get().getMessage();
			const result = await ipc.validateCommitMsg(message);

			// 古いリクエストの応答は無視する
			if (requestId !== validateRequestId) return;

			if (result.ok) {
				set({ validation: result.data });
			}
		},

		clearError: () => set({ error: null }),

		reset: () => set(initialState),
	};
});
