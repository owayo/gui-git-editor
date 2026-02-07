import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useMemo } from "react";

interface BodyTextareaProps {
	value: string;
	onChange: (value: string) => void;
	maxLineLength?: number;
}

export function BodyTextarea({
	value,
	onChange,
	maxLineLength = 72,
}: BodyTextareaProps) {
	const longLines = useMemo(() => {
		return value
			.split("\n")
			.map((line, index) => ({ index: index + 1, length: line.length }))
			.filter((line) => line.length > maxLineLength);
	}, [value, maxLineLength]);

	const hasLongLines = longLines.length > 0;

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<label
					htmlFor="commit-body"
					className="text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Description
				</label>
				{hasLongLines && (
					<span className="text-xs text-amber-600 dark:text-amber-400">
						{longLines.length}行が{maxLineLength}文字を超えています
					</span>
				)}
			</div>

			<textarea
				id="commit-body"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="変更の詳細を記述してください（任意）"
				rows={10}
				className={`w-full resize-y rounded-lg border px-3 py-2 font-mono text-sm transition-colors focus:ring-2 focus:outline-none ${
					hasLongLines
						? "border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-200 dark:border-amber-600 dark:bg-amber-900/20 dark:focus:ring-amber-800"
						: "border-gray-300 bg-white focus:border-blue-400 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-blue-800"
				}`}
			/>

			{hasLongLines && (
				<div className="space-y-1">
					<div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
						<ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
						<span>各行は{maxLineLength}文字以内が推奨されています</span>
					</div>
					<div className="text-xs text-gray-500 dark:text-gray-400">
						超過行:{" "}
						{longLines
							.slice(0, 5)
							.map((l) => `${l.index}行目 (${l.length}文字)`)
							.join(", ")}
						{longLines.length > 5 && ` 他${longLines.length - 5}行`}
					</div>
				</div>
			)}
		</div>
	);
}
