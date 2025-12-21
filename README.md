<p align="center">
  <img src="docs/images/icon.png" width="128" alt="GUI Git Editor">
</p>

<h1 align="center">GUI Git Editor</h1>

<p align="center">
  Git操作（rebase、コミットメッセージ編集）をGUIで直感的に
</p>

<p align="center">
  <a href="https://github.com/owayo/gui-git-editor/actions/workflows/release.yml">
    <img alt="Release" src="https://github.com/owayo/gui-git-editor/actions/workflows/release.yml/badge.svg">
  </a>
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

## Features

- ✨ **Interactive Rebase** - ドラッグ&ドロップでコミットの並び替え
- ⌨️ **キーボード操作** - ショートカットで高速なコマンド変更（p/r/e/s/f/d）
- 🤖 **AIコミットメッセージ** - [git-smart-commit](https://github.com/owayo/git-smart-commit) 連携で自動生成
- 🔄 **Undo/Redo** - 操作の取り消し・やり直し
- 🌙 **ダークモード** - システムテーマに自動追従
- ♿ **アクセシビリティ** - ARIA属性、フォーカス管理対応

## Download

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | [.dmg](https://github.com/owayo/gui-git-editor/releases/latest) |
| macOS (Intel) | [.dmg](https://github.com/owayo/gui-git-editor/releases/latest) |
| Windows | [.msi](https://github.com/owayo/gui-git-editor/releases/latest) |

## Installation

### macOS

1. [Releases](https://github.com/owayo/gui-git-editor/releases/latest) から `.dmg` をダウンロード
2. アプリを `/Applications` にコピー
3. 初回起動時に「開発元を確認できない」エラーが出る場合:

```bash
xattr -d com.apple.quarantine /Applications/gui-git-editor.app
```

### Windows

1. [Releases](https://github.com/owayo/gui-git-editor/releases/latest) から `.msi` をダウンロード
2. インストーラーを実行

## Usage

### Git エディタとして設定

```bash
# macOS（/Applications にインストール済み）
git config --global core.editor '"/Applications/gui-git-editor.app/Contents/MacOS/gui-git-editor"'

# Windows
git config --global core.editor '"C:/Program Files/gui-git-editor/gui-git-editor.exe"'
```

### 設定スクリプト（macOS）

```bash
./scripts/set-editor-release.sh   # リリースビルド
./scripts/set-editor-dev.sh       # デバッグビルド
./scripts/set-editor-vscode.sh    # VS Code に戻す
```

### 動作確認

```bash
git commit                # コミットメッセージ編集
git rebase -i HEAD~3      # Interactive Rebase
git commit --amend        # コミットメッセージ修正
```

## Keyboard Shortcuts

### 共通

| キー | 動作 |
|------|------|
| `⌘/Ctrl + S` | 保存して終了 |
| `Escape` | キャンセル |

### Interactive Rebase

| キー | 動作 |
|------|------|
| `↑` / `↓` | コミット選択 |
| `⌘/Ctrl + ↑↓` | 順序変更 |
| `p` `r` `e` `s` `f` `d` | コマンド変更 |
| `⌘/Ctrl + Z` | Undo |
| `⌘/Ctrl + Shift + Z` | Redo |

## Development

### Requirements

- Node.js 18+
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

### Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Zustand, dnd-kit
- **Backend**: Rust, Tauri v2
- **Build**: Vite

## License

[MIT](LICENSE)
