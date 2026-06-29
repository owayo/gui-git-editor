import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// @ts-expect-error process は Node.js のグローバル。
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
	plugins: [react(), tailwindcss()],

	// Tauri 開発向けの Vite 設定。`tauri dev` / `tauri build` 時のみ適用される。
	//
	// 1. Rust 側のエラーが Vite の画面クリアで隠れないようにする。
	clearScreen: false,
	// 2. Tauri は固定ポートを期待するため、使用できなければ失敗させる。
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host
			? {
					protocol: "ws",
					host,
					port: 1421,
				}
			: undefined,
		watch: {
			// 3. `src-tauri` の監視は Vite 側では行わない。
			ignored: ["**/src-tauri/**"],
		},
	},
}));
