#!/bin/zsh
set -euo pipefail

script_directory="${0:A:h}"
desktop_directory="${script_directory:h}"
project_directory="${desktop_directory:h:h}"
source_app="${desktop_directory}/src-tauri/target/release/bundle/macos/Torvi.app"
installed_app="/Applications/Torvi.app"
backup_directory="${project_directory}/replaced-mac-apps"
backup_suffix="$(/bin/date '+%Y%m%d-%H%M%S')"

if [[ ! -d "$source_app" ]]; then
  echo "Build Torvi first. Current bundle not found: ${source_app}" >&2
  exit 1
fi
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${source_app}/Contents/Info.plist")"
if [[ "$version" != "0.7.0" ]]; then
  echo "Expected Torvi 0.7.0; refusing to install stale version ${version}." >&2
  exit 1
fi

# Never replace the installed app with an unstable identity. Keychain approval
# happens through macOS; this script never exports or prints a private key.
echo "Signing Torvi ${version} with the stable local identity..."
zsh "${script_directory}/sign-macos-app.sh" "$source_app"
zsh "${script_directory}/verify-macos-permission-identity.sh" "$source_app"

echo "Quit every running Torvi copy before installation, then press Return."
read -r confirmation
/bin/mkdir -p "$backup_directory"
if [[ -d "$installed_app" ]]; then
  installed_backup="${backup_directory}/Torvi-${backup_suffix}.app"
  echo "Preserving the previous installed app at: ${installed_backup}"
  /bin/mkdir -p "$installed_backup"
  # Moving Contents needs access only to Torvi.app, not all of /Applications.
  /bin/mv "${installed_app}/Contents" "${installed_backup}/Contents"
fi
if ! /usr/bin/ditto "$source_app" "$installed_app"; then
  echo "Installation failed. Previous version preserved at: ${installed_backup:-not previously installed}" >&2
  exit 1
fi
zsh "${script_directory}/verify-macos-permission-identity.sh" "$installed_app"

echo "Installed: ${installed_app}"
echo "Existing macOS permissions were preserved; no automatic reset was performed."
/usr/bin/open "$installed_app"
