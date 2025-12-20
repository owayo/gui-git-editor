#!/bin/bash
# Set VS Code as the default git editor
# Usage: ./scripts/set-editor-vscode.sh

set -e

echo "Setting git core.editor to VS Code..."
git config --global core.editor 'code --wait'

echo "Done! Current git core.editor:"
git config --global core.editor
