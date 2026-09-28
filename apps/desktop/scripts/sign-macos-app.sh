#!/bin/zsh
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: MACOS_SIGNING_IDENTITY='identity' $0 '/path/to/Torvi.app'" >&2
  exit 64
fi

app_path="$1"
identity_name="${MACOS_SIGNING_IDENTITY:-Torvi Local Development}"
script_directory="${0:A:h}"
entitlements_path="${script_directory}/../src-tauri/Entitlements.plist"
helper_path="${app_path}/Contents/Resources/ic-screencapturekit"
timestamp_argument="--timestamp=none"
if [[ "$identity_name" == Developer\ ID\ Application* ]]; then
  timestamp_argument="--timestamp"
fi

if [[ ! -d "$app_path" || "${app_path:t}" != "Torvi.app" ]]; then
  echo "Expected a Torvi.app bundle, got: ${app_path}" >&2
  exit 64
fi
if [[ "$identity_name" == "-" ]]; then
  echo "Ad-hoc signing is intentionally refused for permission-lifecycle builds." >&2
  exit 65
fi
identity_listing="$(/usr/bin/security find-identity -v -p codesigning)"
if [[ "$identity_listing" != *"\"${identity_name}\""* ]]; then
  # Login identities may not be in the invoking shell's default search list.
  identity_listing="$(/usr/bin/security find-identity -v -p codesigning "${HOME}/Library/Keychains/login.keychain-db")"
fi
identity_fingerprint="$(
  print -r -- "$identity_listing" |
    /usr/bin/awk -v identity="$identity_name" 'index($0, "\"" identity "\"") { print $2; exit }'
)"
if [[ -z "$identity_fingerprint" ]]; then
  echo "Code-signing identity not found: ${identity_name}" >&2
  echo "Run pnpm macos:signing:setup once, or select an Apple Development/Developer ID identity." >&2
  exit 66
fi
if [[ ! -x "$helper_path" ]]; then
  echo "The bundled ScreenCaptureKit helper is missing or not executable: ${helper_path}" >&2
  exit 66
fi

/usr/bin/codesign --force --options runtime "$timestamp_argument" --entitlements "$entitlements_path" --sign "$identity_fingerprint" "$helper_path"
/usr/bin/codesign --force --options runtime "$timestamp_argument" \
  --entitlements "$entitlements_path" \
  --sign "$identity_fingerprint" \
  "$app_path"

/usr/bin/codesign --verify --deep --strict --verbose=2 "$app_path"
requirement="$(/usr/bin/codesign -dr - "$app_path" 2>&1)"
if [[ "$requirement" == *"cdhash"* ]]; then
  echo "The designated requirement is still tied to a build-specific CDHash." >&2
  exit 67
fi

echo "$requirement"
echo "Stable signature verified: ${identity_name} (${identity_fingerprint})"
