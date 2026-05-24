import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileDiffViewer } from "./FileDiffViewer";

describe("FileDiffViewer", () => {
	it("isLoading が true のときはローディングを表示する", () => {
		render(<FileDiffViewer diff="+ added" isLoading={true} />);

		expect(screen.getByText("読み込み中...")).toBeInTheDocument();
	});

	it("差分が空のときはメッセージを表示する", () => {
		render(<FileDiffViewer diff="" isLoading={false} />);

		expect(screen.getByText("差分がありません")).toBeInTheDocument();
	});

	it("差分行をそのまま表示する", () => {
		render(
			<FileDiffViewer
				diff={["@@ -1,2 +1,3 @@", "+added", "-removed", " context"].join("\n")}
				isLoading={false}
			/>,
		);

		expect(screen.getByText("@@ -1,2 +1,3 @@")).toBeInTheDocument();
		expect(screen.getByText("+added")).toBeInTheDocument();
		expect(screen.getByText("-removed")).toBeInTheDocument();
		expect(screen.getByText(/context/)).toBeInTheDocument();
	});

	it("diff のファイルヘッダーを追加・削除行として色付けしない", () => {
		render(
			<FileDiffViewer
				diff={["--- a/file.ts", "+++ b/file.ts", "---removed", "+++added"].join(
					"\n",
				)}
				isLoading={false}
			/>,
		);

		expect(screen.getByText("--- a/file.ts")).toHaveClass("text-gray-500");
		expect(screen.getByText("+++ b/file.ts")).toHaveClass("text-gray-500");
		expect(screen.getByText("---removed")).toHaveClass("text-red-300");
		expect(screen.getByText("+++added")).toHaveClass("text-green-300");
	});
});
