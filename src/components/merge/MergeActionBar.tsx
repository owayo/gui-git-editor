import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useCallback } from "react";
import { useMergeStore } from "../../stores";
import { exitApp } from "../../types/ipc";
import { getShortcut } from "../../utils/platform";

export function MergeActionBar() {
	const { allResolved, isDirty, isSaving, save } = useMergeStore();

	const handleSave = useCallback(async () => {
		const success = await save();
		if (success) {
			await exitApp(0);
		}
	}, [save]);

	const handleCancel = useCallback(async () => {
		await exitApp(1);
	}, []);

	return (
		<div className="flex items-center justify-between border-t border-gray-200 bg-gray-100 px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
			{/* Left: status */}
			<output aria-live="polite" className="flex items-center gap-2 text-sm">
				{isSaving ? (
					<span className="text-blue-600 dark:text-blue-400">保存中...</span>
				) : !allResolved ? (
					<>
						<span
							className="h-2 w-2 rounded-full bg-amber-500"
							aria-hidden="true"
						/>
						<span className="text-amber-600 dark:text-amber-400">
							未解決のコンフリクトがあります
						</span>
					</>
				) : isDirty ? (
					<>
						<span
							className="h-2 w-2 rounded-full bg-amber-500"
							aria-hidden="true"
						/>
						<span className="text-amber-600 dark:text-amber-400">
							未保存の変更があります
						</span>
					</>
				) : null}
			</output>

			{/* Right: actions */}
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={handleCancel}
					aria-label="キャンセル"
					className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-gray-700 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
					title="キャンセル (Esc)"
				>
					<XMarkIcon className="h-4 w-4" aria-hidden="true" />
					<span className="text-sm">キャンセル</span>
				</button>

				<button
					type="button"
					onClick={handleSave}
					disabled={isSaving || !allResolved}
					aria-label={isSaving ? "処理中" : "保存して終了"}
					aria-busy={isSaving}
					className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
					title={
						!allResolved
							? "すべてのコンフリクトを解決してください"
							: `保存して終了 (${getShortcut("S")})`
					}
				>
					<CheckIcon className="h-4 w-4" aria-hidden="true" />
					<span className="text-sm">
						{isSaving ? "処理中..." : "保存して終了"}
					</span>
				</button>
			</div>
		</div>
	);
}
