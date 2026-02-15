import { beforeEach, describe, expect, it } from "vitest";
import { useThemeStore } from "./themeStore";

describe("themeStore", () => {
	beforeEach(() => {
		// Reset to system theme
		useThemeStore.setState({
			theme: "system",
			resolvedTheme: "light",
		});
	});

	it("defaults to system theme", () => {
		const state = useThemeStore.getState();
		expect(state.theme).toBe("system");
	});

	it("setTheme updates theme and resolvedTheme", () => {
		useThemeStore.getState().setTheme("dark");

		const state = useThemeStore.getState();
		expect(state.theme).toBe("dark");
		expect(state.resolvedTheme).toBe("dark");
	});

	it("setTheme to light", () => {
		useThemeStore.getState().setTheme("light");

		const state = useThemeStore.getState();
		expect(state.theme).toBe("light");
		expect(state.resolvedTheme).toBe("light");
	});

	it("toggleTheme switches between light and dark", () => {
		useThemeStore.setState({ resolvedTheme: "light" });
		useThemeStore.getState().toggleTheme();

		expect(useThemeStore.getState().resolvedTheme).toBe("dark");
		expect(useThemeStore.getState().theme).toBe("dark");
	});

	it("toggleTheme from dark to light", () => {
		useThemeStore.setState({ resolvedTheme: "dark" });
		useThemeStore.getState().toggleTheme();

		expect(useThemeStore.getState().resolvedTheme).toBe("light");
		expect(useThemeStore.getState().theme).toBe("light");
	});
});
