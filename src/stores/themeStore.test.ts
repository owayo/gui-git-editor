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

	describe("システムテーマ変更イベント", () => {
		// matchMedia モックに登録された change リスナーを取得するヘルパー
		function getChangeListener():
			| ((e: { matches: boolean }) => void)
			| undefined {
			const mockMatchMedia = window.matchMedia as ReturnType<typeof vi.fn>;
			for (const call of mockMatchMedia.mock.results) {
				const mediaQueryList = call.value;
				const addEventListenerMock =
					mediaQueryList.addEventListener as ReturnType<typeof vi.fn>;
				for (const listenerCall of addEventListenerMock.mock.calls) {
					if (listenerCall[0] === "change") {
						return listenerCall[1] as (e: { matches: boolean }) => void;
					}
				}
			}
			return undefined;
		}

		it("theme が 'system' の場合、change イベントで resolvedTheme が更新される", () => {
			const listener = getChangeListener();
			expect(listener).toBeDefined();

			// theme を "system" に設定
			useThemeStore.setState({ theme: "system", resolvedTheme: "light" });

			// システムテーマがダークに変更されたことをシミュレート
			listener?.({ matches: true });

			expect(useThemeStore.getState().resolvedTheme).toBe("dark");

			// システムテーマがライトに戻ったことをシミュレート
			listener?.({ matches: false });

			expect(useThemeStore.getState().resolvedTheme).toBe("light");
		});

		it("theme が 'dark' や 'light' の場合、change イベントは resolvedTheme を変更しない", () => {
			const listener = getChangeListener();
			expect(listener).toBeDefined();

			// theme を "dark" に設定
			useThemeStore.setState({ theme: "dark", resolvedTheme: "dark" });

			// システムテーマがライトに変更されても影響しない
			listener?.({ matches: false });

			expect(useThemeStore.getState().resolvedTheme).toBe("dark");
			expect(useThemeStore.getState().theme).toBe("dark");

			// theme を "light" に設定
			useThemeStore.setState({ theme: "light", resolvedTheme: "light" });

			// システムテーマがダークに変更されても影響しない
			listener?.({ matches: true });

			expect(useThemeStore.getState().resolvedTheme).toBe("light");
			expect(useThemeStore.getState().theme).toBe("light");
		});
	});
});
