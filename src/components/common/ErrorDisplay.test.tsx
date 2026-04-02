import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppError } from "../../types/errors";
import { ErrorDisplay } from "./ErrorDisplay";

describe("ErrorDisplay", () => {
	it("エラーメッセージを表示する", () => {
		const error: AppError = {
			code: "IoError",
			details: { message: "disk full" },
		};
		render(<ErrorDisplay error={error} />);

		expect(screen.getByText("IO error: disk full")).toBeInTheDocument();
		expect(screen.getByText("エラーが発生しました")).toBeInTheDocument();
	});

	it("FileNotFound エラーでパスを表示する", () => {
		const error: AppError = {
			code: "FileNotFound",
			details: { path: "/tmp/missing.txt" },
		};
		render(<ErrorDisplay error={error} />);

		expect(
			screen.getByText("File not found: /tmp/missing.txt"),
		).toBeInTheDocument();
		// パスはフォーマット済みで別途表示される
		expect(screen.getByText("/tmp/missing.txt")).toBeInTheDocument();
	});

	it("閉じるボタンが onDismiss 指定時のみ表示される", () => {
		const error: AppError = {
			code: "IoError",
			details: { message: "err" },
		};

		const { rerender } = render(<ErrorDisplay error={error} />);
		expect(screen.queryByLabelText("閉じる")).not.toBeInTheDocument();

		rerender(<ErrorDisplay error={error} onDismiss={vi.fn()} />);
		expect(screen.getByLabelText("閉じる")).toBeInTheDocument();
	});

	it("閉じるボタンクリックで onDismiss を呼び出す", async () => {
		const onDismiss = vi.fn();
		const user = userEvent.setup();
		const error: AppError = {
			code: "IoError",
			details: { message: "err" },
		};
		render(<ErrorDisplay error={error} onDismiss={onDismiss} />);

		await user.click(screen.getByLabelText("閉じる"));

		expect(onDismiss).toHaveBeenCalledOnce();
	});

	it("パスがない場合はパス行を表示しない", () => {
		const error: AppError = {
			code: "CommandError",
			details: { message: "git not found" },
		};
		render(<ErrorDisplay error={error} />);

		expect(
			screen.getByText("Command error: git not found"),
		).toBeInTheDocument();
		// font-mono のパス行がないことを確認
		const container = screen
			.getByText("Command error: git not found")
			.closest("div")?.parentElement;
		expect(container?.querySelector(".font-mono")).not.toBeInTheDocument();
	});
});
