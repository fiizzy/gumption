#!/bin/sh
# Copies the latest macOS build into the website's downloads folder, after
# checking Apple has notarized it so visitors don't get a malware warning.
#
#   npm run publish:mac

set -eu

APP_DIRECTORY="$(cd "$(dirname "$0")/.." && pwd)"
WEBSITE_DOWNLOADS_DIRECTORY="$APP_DIRECTORY/../gumption-website/public/downloads"
WEBSITE_SITE_CONFIG="$APP_DIRECTORY/../gumption-website/app/lib/site.ts"
DMG_DIRECTORY="$APP_DIRECTORY/src-tauri/target/universal-apple-darwin/release/bundle/dmg"

VERSION="$(node -p "require('$APP_DIRECTORY/src-tauri/tauri.conf.json').version")"
DMG_NAME="Gumption_${VERSION}_universal.dmg"
DMG_PATH="$DMG_DIRECTORY/$DMG_NAME"

if [ ! -f "$DMG_PATH" ]; then
  echo "No build found at $DMG_PATH" >&2
  echo "Build it first: npx tauri build --target universal-apple-darwin --bundles app,dmg" >&2
  exit 1
fi

MOUNT_POINT="$(mktemp -d)"
hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT_POINT" "$DMG_PATH" >/dev/null
trap 'hdiutil detach "$MOUNT_POINT" -quiet' EXIT
if ! spctl --assess --type execute "$MOUNT_POINT/Gumption.app" 2>/dev/null; then
  echo "$DMG_NAME is not notarized — rebuild with the APPLE_* signing variables set." >&2
  exit 1
fi

cp "$DMG_PATH" "$WEBSITE_DOWNLOADS_DIRECTORY/"
echo "Copied $DMG_NAME ($(du -h "$DMG_PATH" | cut -f1 | tr -d ' ')) to gumption-website/public/downloads"

if ! grep -q "APP_VERSION = \"$VERSION\"" "$WEBSITE_SITE_CONFIG"; then
  echo "Heads up: APP_VERSION in gumption-website/app/lib/site.ts isn't $VERSION yet, so the site still links the old file." >&2
fi
