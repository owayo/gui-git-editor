<p align="center">
  <img src="docs/images/icon.png" width="128" alt="GUI Git Editor">
</p>

<h1 align="center">GUI Git Editor</h1>

<p align="center">
  Git操作（rebase、コミットメッセージ編集、マージコンフリクト解決）をGUIで直感的に
</p>

<p align="center">
  <a href="https://github.com/owayo/gui-git-editor/releases/latest">
    <img alt="Version" src="https://img.shields.io/github/v/release/owayo/gui-git-editor">
  </a>
  <a href="LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/owayo/gui-git-editor">
  </a>
</p>

---

## 概要

`git config --global core.editor` で設定して使用可能なGUIエディタ。
Interactive rebase、commit message編集、squash、rewordなどをすべてサポート。
`git mergetool` としても使用可能で、Monaco Editor ベースの3パネルマージビューでコンフリクトを直感的に解決できます。

## Features

- ✨ **Interactive Rebase** - ドラッグ&ドロップでコミットの並び替え
- ⌨️ **キーボード操作** - ショートカットで高速なコマンド変更（p/r/e/s/f/d）
- ✅ **安全な fixup / squash 判定** - `exec` や `label` を統合先として誤認せず、Git が失敗する rebase todo を事前に防止
- 🤖 **AIコミットメッセージ** - [git-smart-commit](https://github.com/owayo/git-smart-commit) 連携で自動生成
- 🔄 **Undo/Redo** - 操作の取り消し・やり直し
- 🌙 **ダークモード** - システムテーマに自動追従
- 🔀 **Merge Tool** - 3パネルビューでコンフリクト解決（LOCAL / MERGED / REMOTE）
- 📂 **堅牢なステージング表示** - 空白を含むファイル名や rename を含む差分でも正しく一覧化・選択
- 🔁 **差分の自動再同期** - ステージ状態の更新後も、選択中ファイルの diff を再取得して古い表示を残さない
- 🤖 **Codex 連携** - [Codex CLI](https://github.com/openai/codex) + iTerm2 でコンフリクトを自動解決
- ♿ **アクセシビリティ** - ARIA属性、フォーカス管理対応（Rebase項目のTab/Enter選択を含む）

## Screenshots

### Commit Message Editor

<p align="center">
  <img src="docs/images/commit.png" width="720" alt="Commit Message Editor">
</p>

### Interactive Rebase

<p align="center">
  <img src="docs/images/rebase_i.png" width="720" alt="Interactive Rebase">
</p>

### Merge Tool

<p align="center">
  <img src="docs/images/mergetool.png" width="720" alt="Merge Tool">
</p>

## Download

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | [.dmg](https://github.com/owayo/gui-git-editor/releases/latest) |
| macOS (Intel) | [.dmg](https://github.com/owayo/gui-git-editor/releases/latest) |

## Installation

1. [Releases](https://github.com/owayo/gui-git-editor/releases/latest) から `.dmg` をダウンロード
2. アプリを `/Applications` にコピー

#### 初回起動時の注意

macOS では、署名されていないアプリは Gatekeeper によってブロックされます。
「開発元を確認できない」エラーが表示される場合は、初回起動前に以下のコマンドで隔離属性を削除してください:

```bash
xattr -d com.apple.quarantine /Applications/gui-git-editor.app
```

## Usage

### Git commit 時のエディタとして設定

```bash
git config --global core.editor '"/Applications/gui-git-editor.app/Contents/MacOS/gui-git-editor"'
```

### Git rebase -i 時のエディタとして設定

```bash
git config --global sequence.editor '"/Applications/gui-git-editor.app/Contents/MacOS/gui-git-editor"'
```
※ `sequence.editor` 未設定時は `rebase -i` 時、`core.editor` が使用されます。`rebase -i` 時だけ使いたい場合に設定してください。

特殊コマンド（`exec`, `label`, `reset`, `break`, `merge`, `drop`）を含む todo でも、`fixup` / `squash` の統合先は commit 系エントリだけに限定して判定します。
「すべて1つにまとめる」操作でも、特殊コマンドと `drop` は保持したまま後続コミットだけを `fixup` 化します。

### Git マージツールとして設定

```bash
git config --global mergetool.gui-git-editor.cmd \
  '"/Applications/gui-git-editor.app/Contents/MacOS/gui-git-editor" --merge --local "$LOCAL" --remote "$REMOTE" --base "$BASE" --merged "$MERGED"'
git config --global mergetool.gui-git-editor.trustExitCode true
git config --global merge.tool gui-git-editor
```

コンフリクト発生時に `git mergetool` を実行すると、3パネルのマージビューが起動します:

- **左パネル (LOCAL)**: 現在のブランチの変更内容（読み取り専用）— ヘッダーにブランチ名を表示
- **中央パネル (MERGED)**: 解決結果を編集するエディタ
- **右パネル (REMOTE)**: マージ元ブランチの変更内容（読み取り専用）— ヘッダーにブランチ名を表示

BASE パネルはツールバーの「BASE」ボタンで表示/非表示を切り替えられます。
連続解決後の `revert` でも、解決済み領域は行アンカーで追跡し、diff3 形式（`|||||||` 付き）を含めて元の競合ブロックを復元します。
解決後に MERGED 側を手動編集して行位置がずれた場合も、`revert` 時に置換テキストを再特定して誤った位置を復元しないようにしています。
Codex 実行後の再読み込みでは、コンフリクト内容ベースで外部解決を判定し、parser 側のID再採番が起きても整合性を維持しつつ、再出現した競合の stale な resolved 状態は保持しません。

#### Codex CLI による自動解決

[Codex CLI](https://github.com/openai/codex) と [iTerm2](https://iterm2.com/) がインストールされている場合、ツールバーの「Codex で解決」ボタンでコンフリクトを自動解決できます。
iTerm2 が起動中であれば新規タブで、未起動の場合は新規ウィンドウで Codex が開きます。

```bash
npm install -g @openai/codex
brew install --cask iterm2  # 未インストールの場合
```

### 動作確認

```bash
git commit                # コミットメッセージ編集
git rebase -i HEAD~3      # Interactive Rebase
git commit --amend        # コミットメッセージ修正
git mergetool             # マージコンフリクト解決
```

## Keyboard Shortcuts

### 共通

| キー | 動作 |
|------|------|
| `⌘+S` | 保存して終了 |
| `Escape` | キャンセル |

### Interactive Rebase

| キー | 動作 |
|------|------|
| `↑` / `↓` | コミット選択 |
| `⌘+↑` / `⌘+↓` | 順序変更 |
| `p` `r` `e` `s` `f` `d` | コマンド変更 |
| `⌘+Z` | Undo |
| `⌘+⇧+Z` | Redo |

### Merge Tool

| キー | 動作 |
|------|------|
| `⌘+S` | 保存して終了 |
| `Escape` | キャンセル |
| `⌥+↓` | 次のコンフリクトへ移動 |
| `⌥+↑` | 前のコンフリクトへ移動 |
| `⌘+Z` | Undo |
| `⌘+⇧+Z` | Redo |

## Development

### Requirements

- Node.js 20.19+（22 系は 22.13+、推奨は 24.x）
- Rust 1.70+
- pnpm

### Setup

```bash
pnpm install
pnpm tauri dev
```

### Build

```bash
pnpm tauri:build          # リリースビルド
pnpm tauri:build:debug    # デバッグビルド
```

### Test & Lint

```bash
pnpm test                 # フロントエンドテスト (Vitest)
pnpm test:coverage        # カバレッジ付きテスト
pnpm test:rust            # バックエンドテスト (cargo test)
pnpm test:all             # 全テスト
pnpm check                # Biome lint + format
pnpm typecheck            # TypeScript 型チェック
```

主要UIコンポーネント（`ActionBar`, `SubjectInput`, `FileDiffViewer`, `TrailersDisplay`, `RebaseEntryList`, `ConflictNavigator`）に加えて、`mergeStore` のコンフリクト解決/復元ロジック（diff3 revert 含む）、`fileStore` のバックアップパス整合性（古い `backupPath` の残留防止）、`stagingStore` / `commitDiffStore` の競合した非同期応答の無視と、status 更新後の diff 再取得もテストで検証しています。
`utils/rebase.ts` と `rebaseStore` では、特殊コマンドを含む rebase todo に対する `fixup` / `squash` の検証と `squashAll` の安全な変換も確認しています。
`useKeyboardShortcuts` のクロスプラットフォームキーバインド、`useMergeKeyboardShortcuts` のマージ画面キーバインド（保存/キャンセル/コンフリクト移動）、`useAutoBackup` の自動バックアップ間隔・dirty 状態連動・クリーンアップもカバーしています。
`rebaseStore` の `parseContent` / `serialize` の IPC 連携（成功・失敗・空エントリ）、`mergeStore` の `acceptRemote` / `acceptBoth` / コンフリクトナビゲーション / `save`、`themeStore` のシステムテーマ変更イベントリスナーもテストでカバーしています。

### Tech Stack

- **Frontend**: React 19, TypeScript 6, Tailwind CSS v4, Zustand 5, Monaco Editor, dnd-kit
- **Backend**: Rust, Tauri v2
- **Build**: Vite 8
- **Test**: Vitest, Testing Library
- **Lint/Format**: Biome

## License

[MIT](LICENSE)
