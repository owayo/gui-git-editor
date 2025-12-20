#!/bin/bash
# Version bump script for Tauri project
# Version format: yyyy.mm.<counter> (counter starts at 100)
set -e

YEAR=$(date +%Y)
MONTH=$(date +%m)

# Get current version from tauri.conf.json
CURRENT_VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | sed 's/.*"\([0-9][^"]*\)".*/\1/')
echo "Current version: ${CURRENT_VERSION}"

# Parse current version and calculate new counter
if echo "${CURRENT_VERSION}" | grep -qE '^[0-9]{4}\.[0-9]{1,2}\.[0-9]+$'; then
    OLD_YEAR=$(echo "${CURRENT_VERSION}" | cut -d. -f1)
    OLD_MONTH=$(echo "${CURRENT_VERSION}" | cut -d. -f2)
    OLD_COUNTER=$(echo "${CURRENT_VERSION}" | cut -d. -f3)

    # If same year and month, increment counter; otherwise reset to 100
    if [ "${OLD_YEAR}" = "${YEAR}" ] && [ "${OLD_MONTH}" = "${MONTH}" ]; then
        NEW_COUNTER=$((OLD_COUNTER + 1))
    else
        NEW_COUNTER=100
    fi
else
    # Not in expected format, start fresh
    NEW_COUNTER=100
fi

NEW_VERSION="${YEAR}.${MONTH}.${NEW_COUNTER}"

# Update all version files
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" package.json
    sed -i '' "s/^version = \"[^\"]*\"/version = \"${NEW_VERSION}\"/" src-tauri/Cargo.toml
    sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" src-tauri/tauri.conf.json
else
    # Linux/Windows
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" package.json
    sed -i "s/^version = \"[^\"]*\"/version = \"${NEW_VERSION}\"/" src-tauri/Cargo.toml
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"${NEW_VERSION}\"/" src-tauri/tauri.conf.json
fi

# Update Cargo.lock if it exists
[ -f "src-tauri/Cargo.lock" ] && (cd src-tauri && cargo generate-lockfile 2>/dev/null) || true

echo "✅ ${CURRENT_VERSION} → ${NEW_VERSION}"
echo "Updated: package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json"
