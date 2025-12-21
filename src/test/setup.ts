import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Tauri API
vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-cli", () => ({
	getMatches: vi.fn().mockResolvedValue({
		args: {},
	}),
}));

// Mock window.matchMedia for dark mode detection
Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});
