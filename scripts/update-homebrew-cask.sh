#!/usr/bin/env bash
# Render a cask using a verified public release artifact. Works on macOS/Linux.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:?usage: update-homebrew-cask.sh <version> <dmg-sha256> [cask-file]}"
SHA256="${2:?usage: update-homebrew-cask.sh <version> <dmg-sha256> [cask-file]}"
CASK_FILE="${3:-$ROOT/Casks/tenling.rb}"
python3 - "$VERSION" "$SHA256" "$CASK_FILE" <<'PY'
import re
import sys
from pathlib import Path
version, checksum, name = sys.argv[1:]
if not re.fullmatch(r'\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.]+)?', version):
    raise SystemExit('Invalid version')
if not re.fullmatch(r'[a-fA-F0-9]{64}', checksum):
    raise SystemExit('Invalid SHA-256')
p = Path(name)
s = p.read_text()
for key, value in [('version', version), ('sha256', checksum.lower())]:
    s, count = re.subn(rf'^  {key} ".*"$', f'  {key} "{value}"', s, flags=re.M)
    if count != 1:
        raise SystemExit(f'Expected exactly one {key} in {name}')
p.write_text(s)
print(f'Updated {name} to TenLing {version}')
PY
