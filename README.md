# GUI Git Editor

Git操作（rebase、コミットメッセージ編集など）をGUIで行えるTauriアプリ。

## 概要

`git config --global core.editor`で設定して使用可能なGUIエディタです。
core.editorで行える操作（interactive rebase、commit message編集、squash、rewordなど）をすべてサポートします。

## 機能

- **Interactive Rebase**: ドラッグ&ドロップでコミットの並び替え、コマンド変更（pick, reword, squash, fixup, drop等）
- **コミットメッセージ編集**: COMMIT_EDITMSG, MERGE_MSG, SQUASH_MSG, TAG_EDITMSGのサポート
- **ダークモード対応**: システムテーマに自動追従
- **キーボードショートカット**: Ctrl/Cmd+S（保存）、Escape（キャンセル）、Ctrl/Cmd+Z（Undo）

## 技術スタック

- **フロントエンド**: React 19, TypeScript, Tailwind CSS v4, Zustand, dnd-kit
- **バックエンド**: Rust, Tauri v2
- **ビルドツール**: Vite

## 開発

### 必要環境

- Node.js 18+
- Rust 1.70+
- npm または pnpm

### セットアップ

```bash
# 依存関係のインストール
pnpm install

# 開発サーバー起動
pnpm tauri dev
```

### ビルド

```bash
# リリースビルド
pnpm tauri:build

# デバッグビルド（開発用）
pnpm tauri:build:debug
```

### バイナリ更新について

| コマンド | バイナリ更新 |
|----------|--------------|
| `pnpm tauri dev` | ❌ ホットリロードで動作、バイナリ更新なし |
| `cd src-tauri && cargo build` | ✅ debug バイナリを更新 |
| `pnpm tauri:build:debug` | ✅ debug バイナリを更新 |

> **Note**: `tauri dev` は開発サーバーとホットリロードを使用するため、`target/debug/` のバイナリは更新されません。
> Git エディタとして使用する場合は `pnpm tauri:build:debug` でビルドしてください。

## 使用方法

### Git エディタとして設定

ビルド後、`git config --global core.editor` でGitのデフォルトエディタとして設定します。

#### スクリプトで設定（macOS）

```bash
# VS Code に設定
./scripts/set-editor-vscode.sh

# GUI Git Editor（デバッグビルド）に設定
./scripts/set-editor-dev.sh

# GUI Git Editor（リリースビルド、/Applications にインストール済み）に設定
./scripts/set-editor-release.sh
```

#### 手動で設定

##### macOS

```bash
# DMGからApplicationsにインストールした場合
git config --global core.editor '"/Applications/gui-git-editor.app/Contents/MacOS/gui-git-editor"'

# 開発ビルドの場合
git config --global core.editor '"/path/to/gui-git-editor/src-tauri/target/release/gui-git-editor"'
```

##### Linux

```bash
git config --global core.editor '/usr/local/bin/gui-git-editor'
```

##### Windows

```bash
git config --global core.editor '"C:/Program Files/gui-git-editor/gui-git-editor.exe"'
```

### 設定の確認

```bash
git config --global core.editor
```

### 動作確認

設定後、以下のコマンドでGUI エディタが起動することを確認できます：

```bash
# コミットメッセージ編集
git commit

# Interactive Rebase
git rebase -i HEAD~3

# コミットメッセージの修正
git commit --amend
```

### 元に戻す

```bash
# vim に戻す
git config --global core.editor "vim"

# VS Code に戻す
git config --global core.editor "code --wait"

# 設定を削除（システムデフォルトに戻す）
git config --global --unset core.editor
```

## キーボードショートカット

| キー | 動作 |
|------|------|
| `Ctrl/Cmd + S` | 保存して終了 |
| `Escape` | キャンセル（変更を破棄） |
| `Ctrl/Cmd + Z` | 元に戻す（Rebase時） |
| `Ctrl/Cmd + Shift + Z` | やり直す（Rebase時） |

## ライセンス

MIT
