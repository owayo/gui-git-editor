#!/bin/bash
# Release tag script for Tauri project
# Creates and pushes a git tag based on version in tauri.conf.json
set -e

# Get version from tauri.conf.json
VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
TAG="v${VERSION}"

echo "Creating release tag: ${TAG}"

# Check if tag already exists
if git tag -l "${TAG}" | grep -q "${TAG}"; then
    echo "Error: Tag ${TAG} already exists"
    exit 1
fi

# Create and push tag
git tag -a "${TAG}" -m "Release ${TAG}"
git push origin "${TAG}"

echo "✅ Tag pushed: ${TAG}"
echo "GitHub Actions will now build and create the release."
