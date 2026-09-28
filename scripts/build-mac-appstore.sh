#!/usr/bin/env bash
# APPLE_SIGNING_IDENTITY: Apple Distribution / 3rd Party Mac Developer Application
# APPLE_INSTALLER_IDENTITY: 3rd Party Mac Developer Installer
# APPLE_PROVISIONING_PROFILE: downloaded Mac App Store Connect profile
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$ROOT/scripts/apple-toolchain:$PATH"
: "${APPLE_SIGNING_IDENTITY:?Set the Mac App Store application signing identity}"
: "${APPLE_INSTALLER_IDENTITY:?Set the Mac App Store installer signing identity}"
: "${APPLE_PROVISIONING_PROFILE:?Set the path to the Mac App Store Connect provisioning profile}"
[[ -f "$APPLE_PROVISIONING_PROFILE" ]] || { echo 'Provisioning profile not found' >&2; exit 1; }
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
security cms -D -i "$APPLE_PROVISIONING_PROFILE" > "$WORK/profile.plist"
python3 - "$WORK/profile.plist" <<'PY'
import plistlib, sys
with open(sys.argv[1], 'rb') as f: p = plistlib.load(f)
assert p['Entitlements']['com.apple.application-identifier'] == 'URMJKK7N6J.com.tenling.app', 'Wrong provisioning profile'
PY
python3 - "$APPLE_PROVISIONING_PROFILE" "$WORK/signing.json" <<'PY'
import json, sys
from pathlib import Path
Path(sys.argv[2]).write_text(json.dumps({'bundle': {'macOS': {'files': {'embedded.provisionprofile': str(Path(sys.argv[1]).resolve())}}}}))
PY
bun run tauri build --target universal-apple-darwin --bundles app --config src-tauri/tauri.appstore.conf.json --config "$WORK/signing.json"
APP="$ROOT/src-tauri/target/universal-apple-darwin/release/bundle/macos/TenLing.app"
codesign --verify --strict --verbose=2 "$APP"
mkdir -p "$ROOT/artifacts/app-store"
productbuild --component "$APP" /Applications --sign "$APPLE_INSTALLER_IDENTITY" "$ROOT/artifacts/app-store/TenLing.pkg"
pkgutil --check-signature "$ROOT/artifacts/app-store/TenLing.pkg"
