#!/bin/bash
# Download Linux Playwright Chromium for offline Docker builds (Debian/bookworm).
# Run this on a machine WITH internet access.
# Browser revision must match playwright==1.48.0 in dtbackend/requirements.txt.

set -euo pipefail

PLAYWRIGHT_VERSION="1.48.0"
CHROMIUM_REV="1140"
FFMPEG_REV="1010"
ROOT="$(cd "$(dirname "$0")" && pwd)"
BROWSER_PATH="$ROOT/offline_packages/ms-playwright"

echo "Downloading Linux Chromium for Playwright ${PLAYWRIGHT_VERSION} into ${BROWSER_PATH}"

rm -rf "$BROWSER_PATH"
mkdir -p "$BROWSER_PATH/chromium-${CHROMIUM_REV}" "$BROWSER_PATH/ffmpeg-${FFMPEG_REV}"

curl -L "https://playwright.azureedge.net/builds/chromium/${CHROMIUM_REV}/chromium-linux.zip" -o /tmp/playwright-chromium-linux.zip
curl -L "https://playwright.azureedge.net/builds/ffmpeg/${FFMPEG_REV}/ffmpeg-linux.zip" -o /tmp/playwright-ffmpeg-linux.zip
unzip -o /tmp/playwright-chromium-linux.zip -d "$BROWSER_PATH/chromium-${CHROMIUM_REV}"
unzip -o /tmp/playwright-ffmpeg-linux.zip -d "$BROWSER_PATH/ffmpeg-${FFMPEG_REV}"
touch "$BROWSER_PATH/chromium-${CHROMIUM_REV}/INSTALLATION_COMPLETE"
touch "$BROWSER_PATH/ffmpeg-${FFMPEG_REV}/INSTALLATION_COMPLETE"
rm -f /tmp/playwright-chromium-linux.zip /tmp/playwright-ffmpeg-linux.zip

echo "Done. Copy offline_packages/ to the intranet build context, then build with Dockerfile.offline."
echo "  scp -r offline_packages/ user@offline-server:/path/to/dt_report/"
