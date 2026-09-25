#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.
#
# MultiCloudDB Data Explorer installer (macOS / Linux).
# Downloads the latest release asset for your OS and installs it.
#
#   curl -fsSL https://raw.githubusercontent.com/TheovanKraay/multiclouddb-data-explorer/main/install.sh | bash
#
set -euo pipefail

REPO="TheovanKraay/multiclouddb-data-explorer"
API="https://api.github.com/repos/${REPO}/releases/latest"

info()  { printf '\033[0;34m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[0;33mwarn:\033[0m %s\n' "$*" >&2; }
die()   { printf '\033[0;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is required."

OS="$(uname -s)"
ARCH="$(uname -m)"

info "Finding the latest release..."
ASSETS_JSON="$(curl -fsSL "$API")" || die "Could not reach GitHub releases API."

# Pick a matching asset URL by extension/pattern for this platform.
pick_asset() {
  # $1 = grep pattern for the asset name
  printf '%s' "$ASSETS_JSON" \
    | grep -o '"browser_download_url": *"[^"]*"' \
    | sed 's/.*"browser_download_url": *"//; s/"$//' \
    | grep -iE "$1" \
    | head -n1
}

case "$OS" in
  Darwin)
    URL="$(pick_asset '\.dmg$')"
    [ -n "$URL" ] || die "No .dmg asset found in the latest release."
    TMP="$(mktemp -d)"
    DMG="$TMP/app.dmg"
    info "Downloading $URL"
    curl -fsSL "$URL" -o "$DMG"
    info "Mounting image..."
    MOUNT="$(hdiutil attach -nobrowse -quiet "$DMG" | grep -o '/Volumes/.*' | head -n1)"
    [ -n "$MOUNT" ] || die "Failed to mount the disk image."
    APP="$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -n1)"
    [ -n "$APP" ] || { hdiutil detach "$MOUNT" -quiet; die "No .app inside the image."; }
    info "Installing to /Applications (may prompt for your password)..."
    if [ -w /Applications ]; then
      cp -R "$APP" /Applications/
    else
      sudo cp -R "$APP" /Applications/
    fi
    hdiutil detach "$MOUNT" -quiet
    rm -rf "$TMP"
    info "Installed. Launch it from Applications."
    ;;

  Linux)
    # Prefer .deb on Debian/Ubuntu, else fall back to AppImage.
    if command -v dpkg >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
      URL="$(pick_asset '\.deb$')"
      if [ -n "$URL" ]; then
        TMP="$(mktemp -d)"; DEB="$TMP/app.deb"
        info "Downloading $URL"
        curl -fsSL "$URL" -o "$DEB"
        info "Installing (may prompt for your password)..."
        sudo apt-get install -y "$DEB" || sudo dpkg -i "$DEB" || die "Install failed."
        rm -rf "$TMP"
        info "Installed. Search your apps for 'MultiCloudDB Data Explorer'."
        exit 0
      fi
    fi
    # AppImage fallback (portable, no root).
    URL="$(pick_asset '\.AppImage$')"
    [ -n "$URL" ] || die "No .deb or .AppImage asset found for Linux."
    DEST="${HOME}/.local/bin"
    mkdir -p "$DEST"
    OUT="$DEST/multiclouddb-data-explorer.AppImage"
    info "Downloading $URL"
    curl -fsSL "$URL" -o "$OUT"
    chmod +x "$OUT"
    info "Installed to $OUT"
    case ":$PATH:" in
      *":$DEST:"*) : ;;
      *) warn "$DEST is not on your PATH. Add it, or run the AppImage directly." ;;
    esac
    ;;

  *)
    die "Unsupported OS '$OS'. On Windows, use install.ps1 instead."
    ;;
esac
