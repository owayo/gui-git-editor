import { useFileStore } from "../../stores";
import { getShortcut } from "../../utils/platform";

export function FallbackEditor() {
	const { currentContent, setContent } = useFileStore();

	return (
		<div className="flex h-full flex-col gap-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
					テキストエディタ
				</h2>
			</div>

			{/* Instructions */}
			<div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
				<p>
					このファイル形式は認識されませんでした。プレーンテキストとして編集できます。
				</p>
			</div>

			{/* Text editor */}
			<div className="flex-1">
				<textarea
					value={currentContent ?? ""}
					onChange={(e) => setContent(e.target.value)}
					placeholder="テキストを入力してください"
					className="h-full w-full resize-none rounded-lg border border-gray-300 bg-white p-4 font-mono text-sm transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-200 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-blue-800"
				/>
			</div>

			{/* Keyboard shortcuts help */}
			<div className="flex flex-wrap gap-4 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-500">
				<span>
					<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
						{getShortcut("S")}
					</kbd>{" "}
					保存
				</span>
				<span>
					<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
						Esc
					</kbd>{" "}
					キャンセル
				</span>
			</div>
		</div>
	);
}
