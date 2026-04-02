# GUI Git Editor

Git操作（rebase、コミットメッセージ編集、マージコンフリクト解決）をGUIで行うTauriデスクトップアプリケーション。

## Tech Stack

- **Frontend**: React 19 + TypeScript 6 + Tailwind CSS v4 + Zustand + Monaco Editor + dnd-kit
- **Backend**: Rust + Tauri v2
- **Build**: Vite 8
- **Linter/Formatter**: Biome (`biome.jsonc`、インデント: タブ、クォート: ダブル)
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

- Tauri IPC は `src/types/ipc.ts` の `safeInvoke` で統一ラッピング（`IpcResult<T>` 型）。引数キーは camelCase で渡す（Tauri v2 の `#[tauri::command]` マクロが `rename_all = "camelCase"` を適用するため、Rust 側の `snake_case` パラメータに対応する）
- テスト環境では Tauri API をモック（`src/test/setup.ts`）
- ストアは Zustand で管理、`stores/index.ts` で一括エクスポート
- テーマは `zustand/middleware/persist` でローカルストレージに永続化
- Rebase エントリ一覧はセマンティックなリスト構造（`<ul>/<li>`）を採用し、項目選択はキーボード操作に対応
- Rebase の `fixup` / `squash` 判定は commit 系エントリ（`pick` / `reword` / `edit` / `squash` / `fixup`）だけを統合先として扱い、`exec` などの特殊コマンドや `drop` を誤って統合先にしない
- Rebase の「すべて1つにまとめる」は commit 系エントリだけを `fixup` 化し、`exec`・`label`・`drop` などの特殊行は保持する
- Merge の競合解決は `mergeStore` で行アンカー付きの解決済み置換情報を保持し、連続解決・revert 時の位置ずれを防止
- diff3 形式（`|||||||` を含む）の競合を revert した場合も、BASE セクション付きで復元する
- Merge の再読み込みはコンフリクト内容ベースで外部解決を判定し、parse 後のID再採番やID衝突を吸収しつつ、再出現した競合の stale な resolved 状態を保持しない
- `fileStore` はファイル読込成功時とバックアップ作成失敗時に `backupPath` をクリアし、古いバックアップパスの誤再利用を防止する
- `stagingStore` と `commitDiffStore` は request id で非同期レスポンスを突き合わせ、古い diff/status 応答が新しい選択結果を上書きしない
- `stagingStore` は同一パスが staged/unstaged の両方に存在する場合でも、ユーザーが選択中の側を維持しつつ、status 更新後の diff を再取得して stale 表示を残さない
- `useKeyboardShortcuts` の undo / redo はグローバル処理するが、input / textarea / contenteditable 上ではネイティブの編集履歴を優先して横取りしない
- Rust 側の staging コマンドは `git status --porcelain=v1 -z` を使い、空白を含むパスや rename のパスを引用符付き文字列として誤解釈しない

## Testing Conventions

- テストファイルはソースと同じディレクトリに `*.test.tsx` で配置
- Tauri API（`@tauri-apps/api/core`, `@tauri-apps/plugin-cli`）は `setup.ts` でグローバルモック
- `@testing-library/react` + `@testing-library/user-event` を使用
- `vitest` の `globals: true` 設定済み
- commit/rebase/merge の表示系（`FileDiffViewer`, `TrailersDisplay`, `RebaseEntryList`, `ConflictNavigator`）と `mergeStore` の競合解決・復元・再読み込み整合性ロジックをテストでカバー
- `utils/rebase.ts` と `rebaseStore` のテストで、特殊コマンドを含む todo に対する `fixup` / `squash` の検証と `squashAll` の安全性をカバー
- `fileStore`, `stagingStore`, `commitDiffStore` のファイルI/O・Git操作状態管理をテストでカバー（`backupPath` の stale 状態回避、diff/status の競合応答無視、staged/unstaged 両出現時の選択維持と diff 再取得を含む）
- `useKeyboardShortcuts` のクロスプラットフォームキーバインド（Cmd/Ctrl）と、入力欄で undo / redo を横取りしない挙動をテストでカバー
- `useMergeKeyboardShortcuts` のマージ画面キーバインド（保存/キャンセル/コンフリクト移動）をテストでカバー
- `useAutoBackup` の自動バックアップ間隔・dirty 状態連動・クリーンアップをテストでカバー
- `rebaseStore` の `parseContent` / `serialize` IPC連携（成功・失敗・空エントリ）をテストでカバー
- `mergeStore` の `acceptRemote` / `acceptBoth` / コンフリクトナビゲーション / `save` / `initMerge` / `checkCodexAvailable` / `openCodexResolve` / `fetchBlame` / `reloadMergedFile` エラーパス / `clearError` / `updateMergedContent` をテストでカバー
- `themeStore` のシステムテーマ変更イベントリスナーをテストでカバー
- `ConflictNavigator` の全解決状態表示・前後ナビゲーション・エディタスクロール・editorRef null 安全性をテストでカバー
- `CommandSelector` のコマンド選択・disabled 状態・disabledCommands によるオプション無効化をテストでカバー
- `ipc.ts` の全 IPC ラッパーに対し、`invoke` に渡す引数キーが camelCase であることをテストでカバー（snake_case 混入の再発防止）
- `BodyTextarea` の行長超過検出・警告表示・省略表示をテストでカバー
- `ErrorDisplay` のエラーメッセージ表示・パス表示・閉じるボタンの条件表示をテストでカバー
- `FileStatusBadge` の各ステータス（M/A/D/R/C/?）のラベル・背景色・未知ステータスのフォールバックをテストでカバー
- テスト環境では `scrollIntoView` と `ResizeObserver` を `setup.ts` でモック（dnd-kit / headlessui が使用）
