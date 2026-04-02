import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BodyTextarea } from "./BodyTextarea";

describe("BodyTextarea", () => {
	it("テキストエリアを表示する", () => {
		render(<BodyTextarea value="" onChange={vi.fn()} />);

		expect(screen.getByLabelText("Description")).toBeInTheDocument();
	});

	it("値を表示する", () => {
		render(<BodyTextarea value="hello world" onChange={vi.fn()} />);

		expect(screen.getByDisplayValue("hello world")).toBeInTheDocument();
	});

	it("入力時にonChangeを呼び出す", async () => {
		const onChange = vi.fn();
		const user = userEvent.setup();
		render(<BodyTextarea value="" onChange={onChange} />);

		await user.type(screen.getByLabelText("Description"), "a");

		expect(onChange).toHaveBeenCalledWith("a");
	});

	it("maxLineLength を超える行がない場合は警告を表示しない", () => {
		render(<BodyTextarea value="short line" onChange={vi.fn()} />);

		expect(screen.queryByText(/文字を超えています/)).not.toBeInTheDocument();
	});

	it("maxLineLength を超える行がある場合は警告を表示する", () => {
		const longLine = "a".repeat(80);
		render(
			<BodyTextarea value={longLine} onChange={vi.fn()} maxLineLength={72} />,
		);

		expect(screen.getByText(/1行が72文字を超えています/)).toBeInTheDocument();
		expect(screen.getByText(/1行目 \(80文字\)/)).toBeInTheDocument();
	});

	it("複数の超過行を検出する", () => {
		const content = `short\n${"b".repeat(80)}\nok\n${"c".repeat(90)}`;
		render(
			<BodyTextarea value={content} onChange={vi.fn()} maxLineLength={72} />,
		);

		expect(screen.getByText(/2行が72文字を超えています/)).toBeInTheDocument();
		expect(screen.getByText(/2行目 \(80文字\)/)).toBeInTheDocument();
		expect(screen.getByText(/4行目 \(90文字\)/)).toBeInTheDocument();
	});

	it("5行を超える超過行は省略表示する", () => {
		const lines = Array.from({ length: 7 }, () => "x".repeat(80));
		render(
			<BodyTextarea
				value={lines.join("\n")}
				onChange={vi.fn()}
				maxLineLength={72}
			/>,
		);

		expect(screen.getByText(/他2行/)).toBeInTheDocument();
	});

	it("カスタム maxLineLength を使用する", () => {
		const content = "a".repeat(50);
		render(
			<BodyTextarea value={content} onChange={vi.fn()} maxLineLength={40} />,
		);

		expect(screen.getByText(/1行が40文字を超えています/)).toBeInTheDocument();
	});
});
