import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { COMMAND_LABELS, type SimpleCommand } from "../../types/git";
import { CommandSelector } from "./CommandSelector";

describe("CommandSelector", () => {
	it("選択中のコマンドラベルを表示する", () => {
		render(<CommandSelector value="pick" onChange={vi.fn()} />);

		expect(screen.getByText("Pick")).toBeInTheDocument();
	});

	it("disabled 時はボタンが無効になる", () => {
		render(<CommandSelector value="pick" onChange={vi.fn()} disabled />);

		expect(screen.getByRole("button")).toBeDisabled();
	});

	it("各コマンドのラベルが定義されている", () => {
		const commands: SimpleCommand[] = [
			"pick",
			"reword",
			"edit",
			"squash",
			"fixup",
			"drop",
		];
		for (const cmd of commands) {
			expect(COMMAND_LABELS[cmd]).toBeDefined();
		}
	});

	it("クリックでドロップダウンを開き、コマンドを選択できる", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();

		render(<CommandSelector value="pick" onChange={onChange} />);

		await user.click(screen.getByRole("button"));

		const rewordOption = await screen.findByRole("option", { name: /Reword/ });
		await user.click(rewordOption);

		expect(onChange).toHaveBeenCalledWith("reword");
	});

	it("disabledCommands に含まれるコマンドは選択不可になる", async () => {
		const user = userEvent.setup();

		render(
			<CommandSelector
				value="pick"
				onChange={vi.fn()}
				disabledCommands={["squash", "fixup"]}
			/>,
		);

		await user.click(screen.getByRole("button"));

		const squashOption = await screen.findByRole("option", {
			name: /Squash/,
		});
		expect(squashOption).toHaveAttribute("aria-disabled", "true");

		const fixupOption = screen.getByRole("option", { name: /Fixup/ });
		expect(fixupOption).toHaveAttribute("aria-disabled", "true");
	});
});
