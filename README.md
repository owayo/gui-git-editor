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
npm install

# 開発サーバー起動
npm run tauri dev
```

### ビルド

```bash
npm run tauri build
```

## 使用方法

ビルド後、以下のコマンドでGitのデフォルトエディタとして設定できます：

```bash
git config --global core.editor '/path/to/gui-git-editor'
```

## ライセンス

MIT
