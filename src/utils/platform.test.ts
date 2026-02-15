import { afterEach, describe, expect, it } from "vitest";
import { getModifierKey, getShortcut, isMac } from "./platform";

describe("platform utilities", () => {
	const originalNavigator = globalThis.navigator;

	afterEach(() => {
		Object.defineProperty(globalThis, "navigator", {
			value: originalNavigator,
			writable: true,
		});
	});

	describe("isMac", () => {
		it("returns true on macOS", () => {
			Object.defineProperty(globalThis, "navigator", {
				value: { platform: "MacIntel" },
				writable: true,
			});
			expect(isMac()).toBe(true);
		});

		it("returns false on Windows", () => {
			Object.defineProperty(globalThis, "navigator", {
				value: { platform: "Win32" },
				writable: true,
			});
			expect(isMac()).toBe(false);
		});

		it("returns false on Linux", () => {
			Object.defineProperty(globalThis, "navigator", {
				value: { platform: "Linux x86_64" },
				writable: true,
			});
			expect(isMac()).toBe(false);
		});
	});

	describe("getModifierKey", () => {
		it("returns command symbol on Mac", () => {
			Object.defineProperty(globalThis, "navigator", {
				value: { platform: "MacIntel" },
				writable: true,
			});
			expect(getModifierKey()).toBe("\u2318");
		});

		it("returns Ctrl on non-Mac", () => {
			Object.defineProperty(globalThis, "navigator", {
				value: { platform: "Win32" },
				writable: true,
			});
			expect(getModifierKey()).toBe("Ctrl");
		});
	});

	describe("getShortcut", () => {
		it("returns Mac-style shortcut on Mac", () => {
			Object.defineProperty(globalThis, "navigator", {
				value: { platform: "MacIntel" },
				writable: true,
			});
			expect(getShortcut("S")).toBe("\u2318+S");
		});

		it("returns Ctrl-style shortcut on non-Mac", () => {
			Object.defineProperty(globalThis, "navigator", {
				value: { platform: "Win32" },
				writable: true,
			});
			expect(getShortcut("S")).toBe("Ctrl+S");
		});

		it("includes Shift on Mac", () => {
			Object.defineProperty(globalThis, "navigator", {
				value: { platform: "MacIntel" },
				writable: true,
			});
			expect(getShortcut("Z", true)).toBe("\u21E7\u2318+Z");
		});

		it("includes Shift on non-Mac", () => {
			Object.defineProperty(globalThis, "navigator", {
				value: { platform: "Win32" },
				writable: true,
			});
			expect(getShortcut("Z", true)).toBe("Ctrl+Shift+Z");
		});
	});
});
