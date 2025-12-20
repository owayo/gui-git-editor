#!/bin/bash
# Set GUI Git Editor (release build) as the default git editor
# Usage: ./scripts/set-editor-release.sh
#
# Note: The app must be installed in /Applications

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
