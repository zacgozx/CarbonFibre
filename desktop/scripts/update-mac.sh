#!/bin/bash
# Update CarbonFibre on a Mac from Git: pull the latest, build the app for this Mac, and swap it
# in place of the installed one. Started by the app (CarbonFibre menu > Update from Git...) or by
# double-clicking "Update CarbonFibre.command" in Finder; it runs in Terminal so you can watch.
#   update-mac.sh [repo folder] [installed CarbonFibre.app]
# Needs Git, Node.js and Python 3 (brew install git node python). Building on this Mac means the
# new app opens without Gatekeeper's "Open Anyway" warning.
set -uo pipefail

# apps opened from Finder don't get your shell's PATH: add the usual places Homebrew and installers use
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export CSC_IDENTITY_AUTO_DISCOVERY=false      # no signing certificate: don't look for one

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${1:-$(cd "$HERE/../.." && pwd)}"
TARGET="${2:-/Applications/CarbonFibre.app}"
APP_NAME="CarbonFibre"

say()  { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
fail() {
  printf '\n\033[1;31mUpdate stopped: %s\033[0m\n' "$*"
  printf 'Nothing was replaced; the CarbonFibre you have still works.\n'
  [ -t 0 ] && read -r -p "Press Return to close this window. " _
  exit 1
}

for tool in git node npm python3; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool isn't installed. Install it with: brew install git node python"
done
[ -d "$REPO/.git" ] && [ -f "$REPO/desktop/package.json" ] || fail "$REPO isn't the CarbonFibre repo (no .git or desktop/package.json)."
cd "$REPO" || fail "can't open $REPO"

say "Pulling the latest from Git ($(git rev-parse --abbrev-ref HEAD))"
before="$(git rev-parse HEAD)"
git pull --ff-only || fail "git pull didn't go through. If you changed files here, commit or stash them first (git stash), then try again."
after="$(git rev-parse HEAD)"
if [ "$before" = "$after" ]; then echo "Already up to date ($(git log -1 --format='%h %s'))."; else git log --oneline "$before..$after"; fi

cd desktop || fail "no desktop folder"
lock_hash="$(shasum package-lock.json | cut -d' ' -f1)"
if [ ! -d node_modules ] || [ "$(cat node_modules/.cf-lock-hash 2>/dev/null)" != "$lock_hash" ]; then
  say "Installing the build tools (first time, or they changed)"
  npm ci --no-audit --no-fund || fail "npm ci failed (see above)."
  echo "$lock_hash" > node_modules/.cf-lock-hash
fi

case "$(uname -m)" in arm64) ARCH=arm64; OUT=dist/mac-arm64 ;; *) ARCH=x64; OUT=dist/mac ;; esac
say "Building CarbonFibre for this Mac ($ARCH)"
node build-page.js || fail "building the page failed (see above)."
rm -rf "$OUT"
npx electron-builder --mac --dir "--$ARCH" --publish never || fail "the app build failed (see above)."
BUILT="$OUT/$APP_NAME.app"
[ -d "$BUILT" ] || fail "the build finished but $BUILT isn't there."
# Apple silicon won't run an app with no signature at all: sign it "ad hoc" (no certificate needed)
codesign --force --deep --sign - "$BUILT" >/dev/null 2>&1 || fail "signing the new app failed."

say "Closing CarbonFibre"
if pgrep -x "$APP_NAME" >/dev/null; then
  osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1
  for _ in $(seq 1 60); do pgrep -x "$APP_NAME" >/dev/null || break; sleep 1; done
  # still open: it's waiting on you (unsaved changes) - answer it, and this carries on
  while pgrep -x "$APP_NAME" >/dev/null; do echo "Waiting for CarbonFibre to close (answer it if it's asking something)..."; sleep 3; done
fi

say "Installing the new version at $TARGET"
OLD="$TARGET.previous"
rm -rf "$OLD"
if [ -d "$TARGET" ]; then mv "$TARGET" "$OLD" || fail "couldn't move the old app aside (is $TARGET writable?)."; fi
if ! ditto "$BUILT" "$TARGET"; then
  rm -rf "$TARGET"; [ -d "$OLD" ] && mv "$OLD" "$TARGET" && open "$TARGET"
  fail "copying the new app failed; the old one is back."
fi
rm -rf "$OLD"
xattr -cr "$TARGET" 2>/dev/null || true

say "Done: CarbonFibre $(node -p "require('./package.json').version") ($(git log -1 --format='%h'))"
open "$TARGET"
sleep 2
exit 0
