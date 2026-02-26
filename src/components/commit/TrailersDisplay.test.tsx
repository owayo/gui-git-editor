import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TrailersDisplay } from "./TrailersDisplay";

describe("TrailersDisplay", () => {
	it("表示対象がなければ何も表示しない", () => {
		const { container } = render(
			<TrailersDisplay trailers={[]} comments={[]} diffContent={null} />,
		);

		expect(container).toBeEmptyDOMElement();
	});

	it("trailers がある場合は初期表示で内容を展開する", () => {
		render(
			<TrailersDisplay
				trailers={[{ key: "Co-authored-by", value: "alice@example.com" }]}
				comments={[]}
				diffContent={null}
			/>,
		);

		expect(screen.getByText("トレーラー (1)")).toBeInTheDocument();
		expect(screen.getByText("Co-authored-by:")).toBeInTheDocument();
		expect(screen.getByText("alice@example.com")).toBeInTheDocument();
	});

	it("コメントと diff はトグルで表示できる", async () => {
		const user = userEvent.setup();
		render(
			<TrailersDisplay
				trailers={[]}
				comments={["line1", "line2"]}
				diffContent="+added"
			/>,
		);

		expect(screen.queryByText("line1\nline2")).not.toBeInTheDocument();
		expect(screen.queryByText("+added")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "コメント (2行)" }));
		await user.click(screen.getByRole("button", { name: "変更内容 (Diff)" }));

		expect(screen.getByText(/line1\s+line2/)).toBeInTheDocument();
		expect(screen.getByText("+added")).toBeInTheDocument();
	});
});
