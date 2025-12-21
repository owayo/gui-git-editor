import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface ThemeState {
	// State
	theme: Theme;
	resolvedTheme: "light" | "dark";

	// Actions
	setTheme: (theme: Theme) => void;
	toggleTheme: () => void;
}

function getSystemTheme(): "light" | "dark" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function resolveTheme(theme: Theme): "light" | "dark" {
	if (theme === "system") {
		return getSystemTheme();
	}
	return theme;
}

function applyTheme(resolvedTheme: "light" | "dark") {
	if (typeof document === "undefined") return;

	const root = document.documentElement;
	if (resolvedTheme === "dark") {
		root.classList.add("dark");
	} else {
		root.classList.remove("dark");
	}
}

export const useThemeStore = create<ThemeState>()(
	persist(
		(set, get) => ({
			theme: "system",
			resolvedTheme: getSystemTheme(),

			setTheme: (theme: Theme) => {
				const resolvedTheme = resolveTheme(theme);
				applyTheme(resolvedTheme);
				set({ theme, resolvedTheme });
			},

			toggleTheme: () => {
				const { resolvedTheme } = get();
				const newTheme = resolvedTheme === "dark" ? "light" : "dark";
				applyTheme(newTheme);
				set({ theme: newTheme, resolvedTheme: newTheme });
			},
		}),
		{
			name: "gui-git-editor-theme",
			onRehydrateStorage: () => (state) => {
				if (state) {
					const resolvedTheme = resolveTheme(state.theme);
					applyTheme(resolvedTheme);
					state.resolvedTheme = resolvedTheme;
				}
			},
		},
	),
);

// Listen for system theme changes
if (typeof window !== "undefined") {
	window
		.matchMedia("(prefers-color-scheme: dark)")
		.addEventListener("change", (e) => {
			const state = useThemeStore.getState();
			if (state.theme === "system") {
				const resolvedTheme = e.matches ? "dark" : "light";
				applyTheme(resolvedTheme);
				useThemeStore.setState({ resolvedTheme });
			}
		});
}
