#!/bin/bash
# GUI Git Editor（開発ビルド）を既定の Git エディタに設定する
# 使い方: ./scripts/set-editor-dev.sh
#
# メモ: 開発用バイナリを作るには `cd src-tauri && cargo build` または
#       `npm run tauri:build:debug` を実行する。
#       `tauri dev` はホットリロードを使うため、バイナリが更新されない場合がある。

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEV_BINARY="$PROJECT_DIR/src-tauri/target/debug/gui-git-editor"

if [ ! -f "$DEV_BINARY" ]; then
    echo "Error: Dev binary not found at $DEV_BINARY"
    echo "Please run 'npm run tauri:dev' first to build the dev binary."
    exit 1
fi

echo "Setting git core.editor to GUI Git Editor (dev build)..."
git config --global core.editor "'$DEV_BINARY'"

echo "Done! Current git core.editor:"
git config --global core.editor
