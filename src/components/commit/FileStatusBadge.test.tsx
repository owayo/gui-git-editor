import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileStatusBadge } from "./FileStatusBadge";

describe("FileStatusBadge", () => {
	it("Modified ステータスを表示する", () => {
		render(<FileStatusBadge status="M" />);
		expect(screen.getByText("M")).toBeInTheDocument();
	});

	it("Added ステータスを表示する", () => {
		render(<FileStatusBadge status="A" />);
		expect(screen.getByText("A")).toBeInTheDocument();
	});

	it("Deleted ステータスを表示する", () => {
		render(<FileStatusBadge status="D" />);
		expect(screen.getByText("D")).toBeInTheDocument();
	});

	it("Renamed ステータスを表示する", () => {
		render(<FileStatusBadge status="R" />);
		expect(screen.getByText("R")).toBeInTheDocument();
	});

	it("Copied ステータスを表示する", () => {
		render(<FileStatusBadge status="C" />);
		expect(screen.getByText("C")).toBeInTheDocument();
	});

	it("Untracked ステータスを表示する", () => {
		render(<FileStatusBadge status="?" />);
		expect(screen.getByText("?")).toBeInTheDocument();
	});

	it("未知のステータスはそのまま表示する", () => {
		render(<FileStatusBadge status="X" />);
		expect(screen.getByText("X")).toBeInTheDocument();
	});

	it("各ステータスに対応する背景色クラスを適用する", () => {
		const { container, rerender } = render(<FileStatusBadge status="M" />);
		expect(container.querySelector(".bg-amber-500")).toBeInTheDocument();

		rerender(<FileStatusBadge status="A" />);
		expect(container.querySelector(".bg-green-500")).toBeInTheDocument();

		rerender(<FileStatusBadge status="D" />);
		expect(container.querySelector(".bg-red-500")).toBeInTheDocument();
	});

	it("未知のステータスにはデフォルトの灰色を適用する", () => {
		const { container } = render(<FileStatusBadge status="Z" />);
		expect(container.querySelector(".bg-gray-400")).toBeInTheDocument();
	});
});
