import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface SubjectInputProps {
	value: string;
	onChange: (value: string) => void;
	maxLength?: number;
}

export function SubjectInput({
	value,
	onChange,
	maxLength = 50,
}: SubjectInputProps) {
	const isTooLong = value.length > maxLength;
	const charCount = value.length;

	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<label
					htmlFor="commit-subject"
					className="text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					件名 (Subject)
				</label>
				<span
					className={`text-xs ${
						isTooLong
							? "font-medium text-amber-600 dark:text-amber-400"
							: "text-gray-500 dark:text-gray-400"
					}`}
				>
					{charCount}/{maxLength}
				</span>
			</div>

			<input
				id="commit-subject"
				type="text"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="変更内容を簡潔に記述してください"
				className={`w-full rounded-lg border px-3 py-2 font-mono text-sm transition-colors focus:ring-2 focus:outline-none ${
					isTooLong
						? "border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-200 dark:border-amber-600 dark:bg-amber-900/20 dark:focus:ring-amber-800"
						: "border-gray-300 bg-white focus:border-blue-400 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-blue-800"
				}`}
			/>

			{isTooLong && (
				<div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
					<ExclamationTriangleIcon className="h-4 w-4" />
					<span>件名は{maxLength}文字以内が推奨されています</span>
				</div>
			)}
		</div>
	);
}
