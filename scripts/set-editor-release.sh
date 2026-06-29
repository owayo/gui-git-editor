#!/bin/bash
# GUI Git Editor（リリースビルド）を既定の Git エディタに設定する
# 使い方: ./scripts/set-editor-release.sh
#
# メモ: アプリは /Applications にインストール済みである必要がある。

set -e

RELEASE_BINARY="/Applications/gui-git-editor.app/Contents/MacOS/gui-git-editor"

if [ ! -f "$RELEASE_BINARY" ]; then
    echo "Error: Release binary not found at $RELEASE_BINARY"
    echo "Please install the app to /Applications first."
    echo ""
    echo "To build and install:"
    echo "  1. Run 'npm run tauri:build'"
    echo "  2. Open src-tauri/target/release/bundle/dmg/*.dmg"
    echo "  3. Drag the app to /Applications"
    exit 1
fi

echo "Setting git core.editor to GUI Git Editor (release build)..."
git config --global core.editor "'$RELEASE_BINARY'"

echo "Done! Current git core.editor:"
git config --global core.editor
