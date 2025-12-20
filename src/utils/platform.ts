/**
 * Platform detection utilities
 */

/**
 * Check if the current platform is macOS
 */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.platform.toUpperCase().includes("MAC");
}

/**
 * Get the modifier key symbol based on platform
 * @returns "⌘" for Mac, "Ctrl" for other platforms
 */
export function getModifierKey(): string {
  return isMac() ? "⌘" : "Ctrl";
}

/**
 * Get keyboard shortcut display text
 * @param key - The key (e.g., "S", "Z")
 * @param withShift - Whether Shift is also required
 * @returns Formatted shortcut (e.g., "⌘+S" or "Ctrl+S")
 */
export function getShortcut(key: string, withShift = false): string {
  const modifier = getModifierKey();
  if (withShift) {
    return isMac() ? `⇧${modifier}+${key}` : `${modifier}+Shift+${key}`;
  }
  return `${modifier}+${key}`;
}
