interface LoadingProps {
  message?: string;
}

export function Loading({ message = "読み込み中..." }: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex h-full min-h-[200px] flex-col items-center justify-center gap-4"
    >
      <div className="relative" aria-hidden="true">
        <div className="h-10 w-10 rounded-full border-4 border-gray-200 dark:border-gray-700" />
        <div className="absolute top-0 left-0 h-10 w-10 animate-spin rounded-full border-4 border-transparent border-t-blue-500" />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}
