#!/bin/bash
# VS Code を既定の Git エディタに設定する
# 使い方: ./scripts/set-editor-vscode.sh

set -e

echo "Setting git core.editor to VS Code..."
git config --global core.editor 'code --wait'

echo "Done! Current git core.editor:"
git config --global core.editor
