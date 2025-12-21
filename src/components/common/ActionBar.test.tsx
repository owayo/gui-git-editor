import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionBar } from "./ActionBar";

// Mock the theme store
vi.mock("../../stores", () => ({
	useThemeStore: () => ({
		resolvedTheme: "light",
		toggleTheme: vi.fn(),
	}),
}));

describe("ActionBar", () => {
	const defaultProps = {
		onSave: vi.fn(),
		onCancel: vi.fn(),
	};

	it("renders save and cancel buttons", () => {
		render(<ActionBar {...defaultProps} />);

		expect(screen.getByText("保存")).toBeInTheDocument();
		expect(screen.getByText("キャンセル")).toBeInTheDocument();
	});

	it("calls onSave when save button is clicked", () => {
		const onSave = vi.fn();
		render(<ActionBar {...defaultProps} onSave={onSave} isDirty={true} />);

		fireEvent.click(screen.getByText("保存"));
		expect(onSave).toHaveBeenCalledTimes(1);
	});

	it("calls onCancel when cancel button is clicked", () => {
		const onCancel = vi.fn();
		render(<ActionBar {...defaultProps} onCancel={onCancel} />);

		fireEvent.click(screen.getByText("キャンセル"));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("disables save button when not dirty", () => {
		render(<ActionBar {...defaultProps} isDirty={false} />);

		const saveButton = screen.getByRole("button", { name: /保存/ });
		expect(saveButton).toBeDisabled();
	});

	it("disables save button when saving", () => {
		render(<ActionBar {...defaultProps} isDirty={true} isSaving={true} />);

		const saveButton = screen.getByRole("button", { name: /処理中/ });
		expect(saveButton).toBeDisabled();
	});

	it("shows undo/redo buttons when handlers are provided", () => {
		render(
			<ActionBar
				{...defaultProps}
				onUndo={vi.fn()}
				onRedo={vi.fn()}
				canUndo={true}
				canRedo={false}
			/>,
		);

		expect(screen.getByLabelText("元に戻す")).toBeInTheDocument();
		expect(screen.getByLabelText("やり直す")).toBeInTheDocument();
	});

	it("disables undo button when canUndo is false", () => {
		render(
			<ActionBar
				{...defaultProps}
				onUndo={vi.fn()}
				onRedo={vi.fn()}
				canUndo={false}
				canRedo={true}
			/>,
		);

		expect(screen.getByLabelText("元に戻す")).toBeDisabled();
		expect(screen.getByLabelText("やり直す")).not.toBeDisabled();
	});

	it("shows status message when dirty", () => {
		render(<ActionBar {...defaultProps} isDirty={true} />);

		expect(screen.getByText("未保存の変更があります")).toBeInTheDocument();
	});

	it("shows saving message when saving", () => {
		render(<ActionBar {...defaultProps} isSaving={true} />);

		// Status area shows "保存中...", button shows "処理中..."
		expect(screen.getByText("保存中...")).toBeInTheDocument();
		expect(screen.getByText("処理中...")).toBeInTheDocument();
	});
});
