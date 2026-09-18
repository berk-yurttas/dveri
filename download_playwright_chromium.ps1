# Download Linux Playwright Chromium for offline Docker builds (Debian/bookworm).
# Run this on a machine WITH internet access.
# Browser revision must match playwright==1.48.0 in dtbackend/requirements.txt.

$ErrorActionPreference = "Stop"
$PlaywrightVersion = "1.48.0"
$ChromiumRev = "1140"
$FfmpegRev = "1010"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BrowserPath = Join-Path $Root "offline_packages\ms-playwright"

Write-Host "Downloading Linux Chromium for Playwright $PlaywrightVersion into $BrowserPath"

if (Test-Path $BrowserPath) {
    Remove-Item -Recurse -Force $BrowserPath
}
New-Item -ItemType Directory -Force $BrowserPath | Out-Null

$chromiumZip = Join-Path $env:TEMP "playwright-chromium-linux-$ChromiumRev.zip"
$ffmpegZip = Join-Path $env:TEMP "playwright-ffmpeg-linux-$FfmpegRev.zip"
Invoke-WebRequest -Uri "https://playwright.azureedge.net/builds/chromium/$ChromiumRev/chromium-linux.zip" -OutFile $chromiumZip
Invoke-WebRequest -Uri "https://playwright.azureedge.net/builds/ffmpeg/$FfmpegRev/ffmpeg-linux.zip" -OutFile $ffmpegZip

$chromiumDir = Join-Path $BrowserPath "chromium-$ChromiumRev"
$ffmpegDir = Join-Path $BrowserPath "ffmpeg-$FfmpegRev"
New-Item -ItemType Directory -Force $chromiumDir, $ffmpegDir | Out-Null
Expand-Archive -Force $chromiumZip -DestinationPath $chromiumDir
Expand-Archive -Force $ffmpegZip -DestinationPath $ffmpegDir
New-Item -ItemType File -Force (Join-Path $chromiumDir "INSTALLATION_COMPLETE") | Out-Null
New-Item -ItemType File -Force (Join-Path $ffmpegDir "INSTALLATION_COMPLETE") | Out-Null
Remove-Item $chromiumZip, $ffmpegZip -Force

Write-Host "Done. Copy offline_packages/ to the intranet build context, then build with Dockerfile.offline."
Write-Host "  scp -r offline_packages/ user@offline-server:/path/to/dt_report/"
