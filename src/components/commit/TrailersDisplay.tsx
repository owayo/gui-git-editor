import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import type { Trailer } from "../../types/git";

interface TrailersDisplayProps {
	trailers: Trailer[];
	comments: string[];
	diffContent: string | null;
}

export function TrailersDisplay({
	trailers,
	comments,
	diffContent,
}: TrailersDisplayProps) {
	const [showTrailers, setShowTrailers] = useState(trailers.length > 0);
	const [showComments, setShowComments] = useState(false);
	const [showDiff, setShowDiff] = useState(false);

	const hasContent = trailers.length > 0 || comments.length > 0 || diffContent;

	if (!hasContent) {
		return null;
	}

	return (
		<div className="space-y-2">
			{/* Trailers */}
			{trailers.length > 0 && (
				<div className="rounded-lg border border-gray-200 dark:border-gray-700">
					<button
						type="button"
						onClick={() => setShowTrailers(!showTrailers)}
						className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
					>
						{showTrailers ? (
							<ChevronDownIcon className="h-4 w-4" />
						) : (
							<ChevronRightIcon className="h-4 w-4" />
						)}
						トレーラー ({trailers.length})
					</button>
					{showTrailers && (
						<div className="border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
							<dl className="space-y-1">
								{trailers.map((trailer, index) => (
									<div key={index} className="flex gap-2 font-mono text-xs">
										<dt className="font-medium text-blue-600 dark:text-blue-400">
											{trailer.key}:
										</dt>
										<dd className="text-gray-600 dark:text-gray-400">
											{trailer.value}
										</dd>
									</div>
								))}
							</dl>
						</div>
					)}
				</div>
			)}

			{/* Comments */}
			{comments.length > 0 && (
				<div className="rounded-lg border border-gray-200 dark:border-gray-700">
					<button
						type="button"
						onClick={() => setShowComments(!showComments)}
						className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
					>
						{showComments ? (
							<ChevronDownIcon className="h-4 w-4" />
						) : (
							<ChevronRightIcon className="h-4 w-4" />
						)}
						コメント ({comments.length}行)
					</button>
					{showComments && (
						<div className="border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
							<pre className="font-mono text-xs whitespace-pre-wrap text-gray-500 dark:text-gray-500">
								{comments.join("\n")}
							</pre>
						</div>
					)}
				</div>
			)}

			{/* Diff content */}
			{diffContent && (
				<div className="rounded-lg border border-gray-200 dark:border-gray-700">
					<button
						type="button"
						onClick={() => setShowDiff(!showDiff)}
						className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
					>
						{showDiff ? (
							<ChevronDownIcon className="h-4 w-4" />
						) : (
							<ChevronRightIcon className="h-4 w-4" />
						)}
						変更内容 (Diff)
					</button>
					{showDiff && (
						<div className="max-h-64 overflow-auto border-t border-gray-200 bg-gray-900 p-3 dark:border-gray-700">
							<pre className="font-mono text-xs whitespace-pre text-gray-300">
								{diffContent}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
