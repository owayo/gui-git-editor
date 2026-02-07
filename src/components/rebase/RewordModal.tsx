import { SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "../../types/errors";
import { checkGitScAvailable, generateCommitMessage } from "../../types/ipc";
import { getModifierKey } from "../../utils/platform";

interface RewordModalProps {
	isOpen: boolean;
	commitHash: string;
	/** Additional hashes for squash/fixup commits */
	relatedHashes?: string[];
	initialMessage: string;
	onSave: (message: string) => void;
	onCancel: () => void;
}

/** Split a full commit message into subject + body. */
function splitMessage(msg: string): { subject: string; body: string } {
	const lines = msg.split("\n");
	const subject = lines[0] || "";
	const bodyStart = lines.findIndex((l, i) => i > 0 && l === "");
	const body = bodyStart > 0 ? lines.slice(bodyStart + 1).join("\n") : "";
	return { subject, body };
}

/** Join subject + body into a full commit message. */
function joinMessage(subject: string, body: string): string {
	if (body.trim()) {
		return `${subject}\n\n${body}`;
	}
	return subject;
}

export function RewordModal({
	isOpen,
	commitHash,
	relatedHashes = [],
	initialMessage,
	onSave,
	onCancel,
}: RewordModalProps) {
	const [subject, setSubject] = useState("");
	const [body, setBody] = useState("");
	const [isGenerating, setIsGenerating] = useState(false);
	const [generateError, setGenerateError] = useState<string | null>(null);
	const [gitScAvailable, setGitScAvailable] = useState<boolean | null>(null);
	const subjectRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		checkGitScAvailable().then((r) => setGitScAvailable(r.ok ? r.data : false));
	}, []);

	// Reset when modal opens
	useEffect(() => {
		if (isOpen) {
			const { subject: s, body: b } = splitMessage(initialMessage);
			setSubject(s);
			setBody(b);
			setGenerateError(null);
			setTimeout(() => {
				subjectRef.current?.focus();
				subjectRef.current?.select();
			}, 0);
		}
	}, [isOpen, initialMessage]);

	// Keyboard shortcuts
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (!isOpen) return;

			if (event.key === "Escape") {
				event.preventDefault();
				onCancel();
			}

			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
				event.preventDefault();
				if (subject.trim() && !isGenerating) {
					onSave(joinMessage(subject, body));
				}
			}
		},
		[isOpen, subject, body, isGenerating, onSave, onCancel],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown]);

	const handleSave = () => {
		if (subject.trim()) {
			onSave(joinMessage(subject, body));
		}
	};

	const handleGenerateWithAI = async (withBody: boolean) => {
		setIsGenerating(true);
		setGenerateError(null);

		const hashes = [commitHash, ...relatedHashes];
		const result = await generateCommitMessage(hashes, withBody);

		if (result.ok) {
			const { subject: s, body: b } = splitMessage(result.data);
			setSubject(s);
			setBody(b);
			setTimeout(() => {
				subjectRef.current?.focus();
				subjectRef.current?.select();
			}, 0);
		} else {
			setGenerateError(getErrorMessage(result.error));
		}

		setIsGenerating(false);
	};

	if (!isOpen) return null;

	const subjectLength = subject.length;
	const subjectTooLong = subjectLength > 50;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			role="presentation"
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="reword-modal-title"
				className="mx-4 w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-gray-800"
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
					<div>
						<h2
							id="reword-modal-title"
							className="text-lg font-semibold text-gray-800 dark:text-gray-200"
						>
							コミットメッセージを編集
						</h2>
						<p className="text-sm text-gray-500 dark:text-gray-400">
							<span className="font-mono text-amber-600 dark:text-amber-400">
								{commitHash.slice(0, 7)}
							</span>
							{relatedHashes.length > 0 && (
								<span className="ml-2 text-purple-600 dark:text-purple-400">
									+{relatedHashes.length} コミット
								</span>
							)}
						</p>
					</div>
					<div className="flex items-center gap-2">
						{gitScAvailable && (
							<>
								<button
									type="button"
									onClick={() => handleGenerateWithAI(false)}
									disabled={isGenerating}
									className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
								>
									<SparklesIcon className="h-4 w-4" />
									{isGenerating ? "生成中..." : "Commit subject のみを生成"}
								</button>
								<button
									type="button"
									onClick={() => handleGenerateWithAI(true)}
									disabled={isGenerating}
									className="flex items-center gap-1.5 rounded-md bg-purple-700 px-3 py-1.5 text-sm text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
								>
									<SparklesIcon className="h-4 w-4" />
									{isGenerating ? "生成中..." : "Description も生成"}
								</button>
							</>
						)}
						<button
							type="button"
							onClick={onCancel}
							className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
							aria-label="閉じる"
						>
							<XMarkIcon className="h-5 w-5" />
						</button>
					</div>
				</div>

				{/* Body */}
				<div className="space-y-4 p-4">
					{generateError && (
						<div
							id="reword-error"
							role="alert"
							className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
						>
							{generateError}
						</div>
					)}

					{/* Commit subject */}
					<div className="space-y-1">
						<div className="flex items-center justify-between">
							<label
								htmlFor="reword-subject"
								className="text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								Commit subject
							</label>
							<span
								className={`text-xs ${
									subjectTooLong
										? "font-medium text-amber-600 dark:text-amber-400"
										: "text-gray-500 dark:text-gray-400"
								}`}
							>
								{subjectLength}/50
							</span>
						</div>
						<input
							ref={subjectRef}
							id="reword-subject"
							type="text"
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							disabled={isGenerating}
							aria-describedby={generateError ? "reword-error" : undefined}
							aria-busy={isGenerating}
							className={`w-full rounded-lg border px-3 py-2 font-mono text-sm transition-colors focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
								subjectTooLong
									? "border-amber-300 bg-amber-50 focus:border-amber-400 focus:ring-amber-200 dark:border-amber-600 dark:bg-amber-900/20 dark:focus:ring-amber-800"
									: "border-gray-300 bg-white focus:border-blue-400 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-blue-800"
							}`}
							placeholder="変更内容を簡潔に記述"
						/>
					</div>

					{/* Description */}
					<div className="space-y-1">
						<label
							htmlFor="reword-body"
							className="text-sm font-medium text-gray-700 dark:text-gray-300"
						>
							Description
						</label>
						<textarea
							id="reword-body"
							value={body}
							onChange={(e) => setBody(e.target.value)}
							disabled={isGenerating}
							aria-busy={isGenerating}
							rows={6}
							className="w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono text-sm transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:focus:ring-blue-800"
							placeholder="変更の詳細を記述（任意）"
						/>
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700">
					<p className="text-xs text-gray-500 dark:text-gray-400">
						<kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono dark:bg-gray-700">
							{getModifierKey()}+Enter
						</kbd>{" "}
						で保存
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={onCancel}
							disabled={isGenerating}
							className="rounded-md px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
						>
							キャンセル
						</button>
						<button
							type="button"
							onClick={handleSave}
							disabled={!subject.trim() || isGenerating}
							className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
						>
							保存
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
