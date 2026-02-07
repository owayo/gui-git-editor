const STATUS_STYLES: Record<string, { bg: string; label: string }> = {
	M: { bg: "bg-amber-500", label: "M" },
	A: { bg: "bg-green-500", label: "A" },
	D: { bg: "bg-red-500", label: "D" },
	R: { bg: "bg-blue-500", label: "R" },
	C: { bg: "bg-purple-500", label: "C" },
	"?": { bg: "bg-gray-400", label: "?" },
};

interface FileStatusBadgeProps {
	status: string;
}

export function FileStatusBadge({ status }: FileStatusBadgeProps) {
	const style = STATUS_STYLES[status] ?? {
		bg: "bg-gray-400",
		label: status,
	};

	return (
		<span
			className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-white ${style.bg}`}
		>
			{style.label}
		</span>
	);
}
