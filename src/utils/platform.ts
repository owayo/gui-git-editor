/**
 * プラットフォーム判定ユーティリティ。
 */

/**
 * 現在のプラットフォームが macOS か判定する。
 */
export function isMac(): boolean {
	if (typeof navigator === "undefined") return false;
	return navigator.platform.toUpperCase().includes("MAC");
}

/**
 * プラットフォームに応じた修飾キー表記を返す。
 * @returns Mac では "⌘"、それ以外では "Ctrl"
 */
export function getModifierKey(): string {
	return isMac() ? "⌘" : "Ctrl";
}

/**
 * キーボードショートカットの表示文字列を返す。
 * @param key - キー（例: "S", "Z"）
 * @param withShift - Shift も必要かどうか
 * @returns 整形済みショートカット（例: "⌘+S" または "Ctrl+S"）
 */
export function getShortcut(key: string, withShift = false): string {
	const modifier = getModifierKey();
	if (withShift) {
		return isMac() ? `⇧${modifier}+${key}` : `${modifier}+Shift+${key}`;
	}
	return `${modifier}+${key}`;
}
