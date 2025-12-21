import {
	ExclamationTriangleIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import type { AppError } from "../../types/errors";
import { getErrorMessage } from "../../types/errors";

interface ErrorDisplayProps {
	error: AppError;
	onDismiss?: () => void;
}

export function ErrorDisplay({ error, onDismiss }: ErrorDisplayProps) {
	const message = getErrorMessage(error);

	return (
		<div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
			<div className="flex items-start gap-3">
				<ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500 dark:text-red-400" />
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-medium text-red-800 dark:text-red-200">
						エラーが発生しました
					</h3>
					<p className="mt-1 text-sm text-red-700 dark:text-red-300">
						{message}
					</p>
					{error.details.path && (
						<p className="mt-1 truncate font-mono text-xs text-red-600 dark:text-red-400">
							{error.details.path}
						</p>
					)}
				</div>
				{onDismiss && (
					<button
						type="button"
						onClick={onDismiss}
						className="flex-shrink-0 rounded-md p-1 text-red-500 transition-colors hover:bg-red-100 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-800/50 dark:hover:text-red-200"
						aria-label="閉じる"
					>
						<XMarkIcon className="h-5 w-5" />
					</button>
				)}
			</div>
		</div>
	);
}
