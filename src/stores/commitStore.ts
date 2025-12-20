import { create } from "zustand";
import type { CommitMessage, Trailer, CommitValidation } from "../types/git";
import type { AppError } from "../types/errors";
import * as ipc from "../types/ipc";

interface CommitState {
  // State
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

  // Derived
  getMessage: () => CommitMessage;

  // Actions
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
};

export const useCommitStore = create<CommitState>((set, get) => ({
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
      });
      // Validate after parsing
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
    const { originalSubject, originalBody, body } = get();
    set({
      subject,
      isDirty: subject !== originalSubject || body !== originalBody,
    });
    // Debounced validation would be better in production
    get().validate();
  },

  setBody: (body: string) => {
    const { originalSubject, originalBody, subject } = get();
    set({
      body,
      isDirty: subject !== originalSubject || body !== originalBody,
    });
    get().validate();
  },

  addTrailer: (trailer: Trailer) => {
    set((state) => ({
      trailers: [...state.trailers, trailer],
    }));
  },

  removeTrailer: (index: number) => {
    set((state) => ({
      trailers: state.trailers.filter((_, i) => i !== index),
    }));
  },

  updateTrailer: (index: number, trailer: Trailer) => {
    set((state) => ({
      trailers: state.trailers.map((t, i) => (i === index ? trailer : t)),
    }));
  },

  validate: async () => {
    const message = get().getMessage();
    const result = await ipc.validateCommitMsg(message);

    if (result.ok) {
      set({ validation: result.data });
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));
