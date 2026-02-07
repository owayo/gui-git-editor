interface FileDiffViewerProps {
	diff: string;
	isLoading: boolean;
}

export function FileDiffViewer({ diff, isLoading }: FileDiffViewerProps) {
	if (isLoading) {
		return (
			<div className="flex items-center justify-center p-4 text-sm text-gray-500 dark:text-gray-400">
				読み込み中...
			</div>
		);
	}

	if (!diff) {
		return (
			<div className="flex items-center justify-center p-4 text-sm text-gray-500 dark:text-gray-400">
				差分がありません
			</div>
		);
	}

	return (
		<div className="overflow-auto bg-gray-950 p-2">
			<pre className="font-mono text-xs leading-relaxed">
				{diff.split("\n").map((line, i) => {
					let className = "text-gray-300";
					let bgClassName = "";

					if (line.startsWith("+")) {
						className = "text-green-300";
						bgClassName = "bg-green-900/30";
					} else if (line.startsWith("-")) {
						className = "text-red-300";
						bgClassName = "bg-red-900/30";
					} else if (line.startsWith("@@")) {
						className = "text-blue-300";
						bgClassName = "bg-blue-900/20";
					} else if (
						line.startsWith("diff ") ||
						line.startsWith("index ") ||
						line.startsWith("---") ||
						line.startsWith("+++")
					) {
						className = "text-gray-500";
					}

					return (
						<div key={i} className={`${bgClassName} px-1`}>
							<span className={className}>{line}</span>
						</div>
					);
				})}
			</pre>
		</div>
	);
}
