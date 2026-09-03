#!/bin/zsh
set -euo pipefail

if [[ $# -ne 1 || ! -d "$1" ]]; then
  echo "Usage: $0 '/path/to/Torvi.app'" >&2
  exit 64
fi

app_path="$1"
bundle_identifier="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${app_path}/Contents/Info.plist")"
bundle_version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${app_path}/Contents/Info.plist")"
signature="$(/usr/bin/codesign -dvvv "$app_path" 2>&1)"
requirement="$(/usr/bin/codesign -dr - "$app_path" 2>&1)"

echo "Bundle identifier: ${bundle_identifier}"
echo "App version: ${bundle_version}"
echo "$signature" | /usr/bin/grep -E '^(Authority|TeamIdentifier|CDHash|Signature)='
echo "$requirement"

if [[ "$bundle_identifier" != "com.interviewcopilot.desktop" ]]; then
  echo "Unexpected bundle identifier; TCC will treat this as a different app." >&2
  exit 65
fi
if [[ "$requirement" == *"cdhash"* ]]; then
  echo "FAIL: this is an ad-hoc/build-specific identity. Permission persistence cannot be verified." >&2
  exit 66
fi

/usr/bin/codesign --verify --deep --strict --verbose=2 "$app_path"
echo "PASS: the app has a stable designated requirement suitable for permission-persistence testing."
