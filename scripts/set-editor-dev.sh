#!/bin/bash
# Set GUI Git Editor (dev build) as the default git editor
# Usage: ./scripts/set-editor-dev.sh
#
# Note: Run `npm run tauri:dev` at least once to build the dev binary

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
