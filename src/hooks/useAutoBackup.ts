import { useEffect, useRef, useCallback } from "react";
import { createBackup, deleteBackup } from "../types/ipc";

const BACKUP_INTERVAL_MS = 30000; // 30 seconds

interface UseAutoBackupOptions {
  filePath: string | null;
  isDirty: boolean;
  enabled?: boolean;
}

export function useAutoBackup({
  filePath,
  isDirty,
  enabled = true,
}: UseAutoBackupOptions) {
  const lastBackupRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create backup
  const performBackup = useCallback(async () => {
    if (!filePath || !isDirty) return;

    try {
      const result = await createBackup(filePath);
      if (result.ok) {
        lastBackupRef.current = result.data;
      }
    } catch (error) {
      console.error("Failed to create backup:", error);
    }
  }, [filePath, isDirty]);

  // Delete backup (called on successful save)
  const clearBackup = useCallback(async () => {
    if (!filePath) return;

    try {
      await deleteBackup(filePath);
      lastBackupRef.current = null;
    } catch (error) {
      console.error("Failed to delete backup:", error);
    }
  }, [filePath]);

  // Set up interval for auto-backup
  useEffect(() => {
    if (!enabled || !filePath) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial backup if dirty
    if (isDirty) {
      performBackup();
    }

    // Set up interval
    intervalRef.current = setInterval(() => {
      if (isDirty) {
        performBackup();
      }
    }, BACKUP_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, filePath, isDirty, performBackup]);

  // Clear backup when content changes to match saved state
  useEffect(() => {
    if (!isDirty && lastBackupRef.current) {
      clearBackup();
    }
  }, [isDirty, clearBackup]);

  return {
    performBackup,
    clearBackup,
    hasBackup: lastBackupRef.current !== null,
  };
}
