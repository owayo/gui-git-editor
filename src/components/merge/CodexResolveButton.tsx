import { ArrowPathIcon, CommandLineIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { useMergeStore } from "../../stores";

export function CodexResolveButton() {
	const {
		codexAvailable,
		checkCodexAvailable,
		openCodexResolve,
		reloadMergedFile,
	} = useMergeStore();

	const [codexLaunched, setCodexLaunched] = useState(false);
	const [isReloading, setIsReloading] = useState(false);

	// Check codex availability on mount
	useEffect(() => {
		checkCodexAvailable();
	}, [checkCodexAvailable]);

	const handleOpenCodex = useCallback(async () => {
		await openCodexResolve();
		setCodexLaunched(true);
	}, [openCodexResolve]);

	const handleReload = useCallback(async () => {
		setIsReloading(true);
		await reloadMergedFile();
		setIsReloading(false);
		setCodexLaunched(false);
	}, [reloadMergedFile]);

	// Still checking availability
	if (codexAvailable === null) {
		return null;
	}

	return (
		<div className="flex items-center gap-1">
			<button
				type="button"
				onClick={handleOpenCodex}
				disabled={!codexAvailable}
				className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors enabled:bg-purple-100 enabled:text-purple-700 enabled:hover:bg-purple-200 disabled:cursor-not-allowed disabled:text-gray-400 dark:enabled:bg-purple-900 dark:enabled:text-purple-300 dark:enabled:hover:bg-purple-800 dark:disabled:text-gray-600"
				title={
					codexAvailable
						? "Codex CLI でコンフリクトを自動解決"
						: "codex がインストールされていません (npm i -g @openai/codex)"
				}
			>
				<CommandLineIcon className="h-3.5 w-3.5" aria-hidden="true" />
				Codex で解決
			</button>

			{codexLaunched && (
				<button
					type="button"
					onClick={handleReload}
					disabled={isReloading}
					className="flex items-center gap-1 rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 disabled:opacity-50 dark:bg-blue-900 dark:text-blue-300 dark:hover:bg-blue-800"
					title="Codex 実行後にファイルを再読み込み"
				>
					<ArrowPathIcon
						className={`h-3.5 w-3.5 ${isReloading ? "animate-spin" : ""}`}
						aria-hidden="true"
					/>
					{isReloading ? "読み込み中..." : "再読み込み"}
				</button>
			)}
		</div>
	);
}
