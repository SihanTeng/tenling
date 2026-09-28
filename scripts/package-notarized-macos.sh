#!/usr/bin/env bash
# Usage: NOTARY_PROFILE=... APPLE_SIGNING_IDENTITY=... bash scripts/package-notarized-macos.sh [app]
# Submits the app and disk image to Apple's notarization service.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="${1:-$ROOT/src-tauri/target/universal-apple-darwin/release/bundle/macos/TenLing.app}"
: "${NOTARY_PROFILE:?Set an existing notarytool Keychain profile}"
: "${APPLE_SIGNING_IDENTITY:?Set the Developer ID Application signing identity}"
VERSION=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$APP/Contents/Info.plist")
OUT="$ROOT/artifacts/macos"
mkdir -p "$OUT"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
codesign --verify --deep --strict --verbose=2 "$APP"
codesign -d --verbose=4 "$APP" 2> "$WORK/signature.txt"
rg -q '^Authority=Developer ID Application:' "$WORK/signature.txt"
rg -q '^Timestamp=' "$WORK/signature.txt"
rg -q 'flags=.*runtime' "$WORK/signature.txt"
for arch in arm64 x86_64; do
  lipo "$APP/Contents/MacOS/tenling" -verify_arch "$arch"
done
# Work on a copy so subsequent builds cannot mutate a notarization submission.
ditto "$APP" "$WORK/TenLing.app"
ditto -c -k --keepParent "$WORK/TenLing.app" "$OUT/TenLing-$VERSION-notarization.zip"
xcrun notarytool submit "$OUT/TenLing-$VERSION-notarization.zip" --keychain-profile "$NOTARY_PROFILE" --wait --timeout 20m --output-format json > "$OUT/notarization-app.json"
python3 - "$OUT/notarization-app.json" <<'PY'
import json, sys
assert json.load(open(sys.argv[1]))['status'] == 'Accepted', 'App notarization failed'
PY
xcrun stapler staple "$WORK/TenLing.app"
xcrun stapler validate "$WORK/TenLing.app"
spctl --assess --type execute --verbose=2 "$WORK/TenLing.app"
mkdir "$WORK/dmg"
mv "$WORK/TenLing.app" "$WORK/dmg/"
ln -s /Applications "$WORK/dmg/Applications"
DMG="$OUT/tenling-$VERSION-macos-universal.dmg"
hdiutil create -volname TenLing -srcfolder "$WORK/dmg" -ov -format UDZO "$DMG"
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG"
xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait --timeout 20m --output-format json > "$OUT/notarization-dmg.json"
python3 - "$OUT/notarization-dmg.json" <<'PY'
import json, sys
assert json.load(open(sys.argv[1]))['status'] == 'Accepted', 'DMG notarization failed'
PY
xcrun stapler staple "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
shasum -a 256 "$DMG"
