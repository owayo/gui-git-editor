#!/bin/bash
# Release commit & tag script for Tauri project
# Commits version files, creates tag, and pushes both
set -e

# Get version from tauri.conf.json
VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
TAG="v${VERSION}"

echo "Preparing release: ${TAG}"

# Check if tag already exists
if git tag -l "${TAG}" | grep -q "${TAG}"; then
    echo "Error: Tag ${TAG} already exists"
    exit 1
fi

# Stage version files
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
[ -f "package-lock.json" ] && git add package-lock.json
[ -f "src-tauri/Cargo.lock" ] && git add src-tauri/Cargo.lock

# Commit
git commit -m "Release ${TAG}"

# Tag & Push
git tag -a "${TAG}" -m "Release ${TAG}"
git push origin HEAD "${TAG}"

echo "✅ Committed and tagged: ${TAG}"
echo "GitHub Actions will now build and create the release."
