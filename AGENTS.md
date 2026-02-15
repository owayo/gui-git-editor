# GUI Git Editor

Git操作（rebase、コミットメッセージ編集、マージコンフリクト解決）をGUIで行うTauriデスクトップアプリケーション。

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Zustand + Monaco Editor + dnd-kit
- **Backend**: Rust + Tauri v2
- **Build**: Vite 7
- **Linter/Formatter**: Biome (インデント: タブ、クォート: ダブル)
- **Test**: Vitest + Testing Library (jsdom)
- **Package Manager**: pnpm

## Project Structure

```
src/
  App.tsx              # メインコンポーネント（ファイルタイプに基づくルーティング）
  main.tsx             # エントリーポイント
  index.css            # Tailwind CSS
  components/
    commit/            # コミットメッセージエディタ
    rebase/            # Interactive Rebase エディタ
    merge/             # マージコンフリクト解決エディタ
    common/            # 共通コンポーネント（ActionBar, ErrorDisplay等）
    fallback/          # フォールバックエディタ
  stores/              # Zustand ストア
    commitStore.ts     # コミットメッセージ状態
    rebaseStore.ts     # Rebase todo 状態
    mergeStore.ts      # マージコンフリクト状態
    fileStore.ts       # ファイル読み書き
    historyStore.ts    # Undo/Redo 履歴
    stagingStore.ts    # ステージング状態
    themeStore.ts      # テーマ管理（persist）
  hooks/               # カスタムフック
  types/               # 型定義
    git.ts             # Git関連型
    ipc.ts             # Tauri IPC ラッパー
    errors.ts          # エラー型
  utils/               # ユーティリティ
src-tauri/             # Rust バックエンド
```

## Commands

```bash
pnpm install           # 依存関係インストール
pnpm dev               # Vite 開発サーバー起動
pnpm build             # TypeScript + Vite ビルド
pnpm typecheck         # 型チェック
pnpm test              # Vitest テスト実行
pnpm test:watch        # テストウォッチモード
pnpm test:coverage     # カバレッジ付きテスト
pnpm check             # Biome lint + format
pnpm tauri:dev         # Tauri 開発ビルド
pnpm tauri:build       # Tauri リリースビルド
pnpm test:rust         # Rust テスト
pnpm test:all          # 全テスト（JS + Rust）
```

## Architecture Notes

- Tauri IPC は `src/types/ipc.ts` の `safeInvoke` で統一ラッピング（`IpcResult<T>` 型）
- テスト環境では Tauri API をモック（`src/test/setup.ts`）
- ストアは Zustand で管理、`stores/index.ts` で一括エクスポート
- テーマは `zustand/middleware/persist` でローカルストレージに永続化

## Testing Conventions

- テストファイルはソースと同じディレクトリに `*.test.tsx` で配置
- Tauri API（`@tauri-apps/api/core`, `@tauri-apps/plugin-cli`）は `setup.ts` でグローバルモック
- `@testing-library/react` + `@testing-library/user-event` を使用
- `vitest` の `globals: true` 設定済み
