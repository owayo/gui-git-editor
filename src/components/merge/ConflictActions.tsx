import { useCallback } from "react";
import { useMergeStore } from "../../stores";
import type { ConflictRegion } from "../../types/git";

interface ConflictActionsProps {
	conflict: ConflictRegion;
}

export function ConflictActions({ conflict }: ConflictActionsProps) {
	const { acceptLocal, acceptRemote, acceptBoth } = useMergeStore();

	const handleAcceptLocal = useCallback(() => {
		acceptLocal(conflict.id);
	}, [acceptLocal, conflict.id]);

	const handleAcceptRemote = useCallback(() => {
		acceptRemote(conflict.id);
	}, [acceptRemote, conflict.id]);

	const handleAcceptBoth = useCallback(() => {
		acceptBoth(conflict.id);
	}, [acceptBoth, conflict.id]);

	if (conflict.resolved) {
		return (
			<span className="text-xs text-green-600 dark:text-green-400">
				解決済み
			</span>
		);
	}

	return (
		<div className="flex items-center gap-1">
			<button
				type="button"
				onClick={handleAcceptLocal}
				className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700"
			>
				LOCAL
			</button>
			<button
				type="button"
				onClick={handleAcceptRemote}
				className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700"
			>
				REMOTE
			</button>
			<button
				type="button"
				onClick={handleAcceptBoth}
				className="rounded bg-purple-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-purple-700"
			>
				両方
			</button>
		</div>
	);
}
