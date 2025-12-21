import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SubjectInput } from "./SubjectInput";

describe("SubjectInput", () => {
	const defaultProps = {
		value: "",
		onChange: vi.fn(),
	};

	it("renders input with label", () => {
		render(<SubjectInput {...defaultProps} />);

		expect(screen.getByLabelText("件名 (Subject)")).toBeInTheDocument();
	});

	it("displays character count", () => {
		render(<SubjectInput {...defaultProps} value="Hello" />);

		expect(screen.getByText("5/50")).toBeInTheDocument();
	});

	it("calls onChange when input changes", () => {
		const onChange = vi.fn();
		render(<SubjectInput {...defaultProps} onChange={onChange} />);

		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "New commit message" },
		});

		expect(onChange).toHaveBeenCalledWith("New commit message");
	});

	it("shows warning when text is too long", () => {
		const longText = "a".repeat(60);
		render(<SubjectInput {...defaultProps} value={longText} />);

		expect(
			screen.getByText("件名は50文字以内が推奨されています"),
		).toBeInTheDocument();
	});

	it("respects custom maxLength", () => {
		render(<SubjectInput {...defaultProps} value="Hello" maxLength={72} />);

		expect(screen.getByText("5/72")).toBeInTheDocument();
	});
});
