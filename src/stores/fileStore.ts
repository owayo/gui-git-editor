import { create } from "zustand";
import type { FileContent, GitFileType } from "../types/git";
import type { AppError } from "../types/errors";
import * as ipc from "../types/ipc";

interface FileState {
  // State
  filePath: string | null;
  fileType: GitFileType | null;
  originalContent: string | null;
  currentContent: string | null;
  backupPath: string | null;
  isLoading: boolean;
  isSaving: boolean;
  error: AppError | null;
  isDirty: boolean;

  // Actions
  loadFile: (path: string) => Promise<void>;
  saveFile: () => Promise<boolean>;
  setContent: (content: string) => void;
  createBackup: () => Promise<boolean>;
  restoreBackup: () => Promise<boolean>;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  filePath: null,
  fileType: null,
  originalContent: null,
  currentContent: null,
  backupPath: null,
  isLoading: false,
  isSaving: false,
  error: null,
  isDirty: false,
};

export const useFileStore = create<FileState>((set, get) => ({
  ...initialState,

  loadFile: async (path: string) => {
    set({ isLoading: true, error: null });

    const result = await ipc.readFile(path);

    if (result.ok) {
      const file: FileContent = result.data;
      set({
        filePath: file.path,
        fileType: file.file_type,
        originalContent: file.content,
        currentContent: file.content,
        isLoading: false,
        isDirty: false,
      });
    } else {
      set({
        error: result.error,
        isLoading: false,
      });
    }
  },

  saveFile: async () => {
    const { filePath, currentContent } = get();
    if (!filePath || currentContent === null) return false;

    set({ isSaving: true, error: null });

    const result = await ipc.writeFile(filePath, currentContent);

    if (result.ok) {
      set({
        originalContent: currentContent,
        isSaving: false,
        isDirty: false,
      });
      return true;
    } else {
      set({
        error: result.error,
        isSaving: false,
      });
      return false;
    }
  },

  setContent: (content: string) => {
    const { originalContent } = get();
    set({
      currentContent: content,
      isDirty: content !== originalContent,
    });
  },

  createBackup: async () => {
    const { filePath } = get();
    if (!filePath) return false;

    const result = await ipc.createBackup(filePath);

    if (result.ok) {
      set({ backupPath: result.data });
      return true;
    } else {
      set({ error: result.error });
      return false;
    }
  },

  restoreBackup: async () => {
    const { backupPath, filePath } = get();
    if (!backupPath || !filePath) return false;

    const result = await ipc.restoreBackup(backupPath, filePath);

    if (result.ok) {
      // Reload the file after restore
      await get().loadFile(filePath);
      return true;
    } else {
      set({ error: result.error });
      return false;
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set(initialState),
}));
