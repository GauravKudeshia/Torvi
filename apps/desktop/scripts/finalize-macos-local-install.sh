#!/bin/zsh
set -euo pipefail

script_directory="${0:A:h}"
desktop_directory="${script_directory:h}"
project_directory="${desktop_directory:h:h}"
source_app="${project_directory}/Torvi.app"
installed_app="/Applications/Torvi.app"
legacy_app="/Applications/Live Copilot.app"
backup_directory="${project_directory}/replaced-mac-apps"
backup_suffix="$(/bin/date '+%Y%m%d-%H%M%S')"

if [[ ! -d "$source_app" ]]; then
  echo "Current Torvi bundle not found: ${source_app}" >&2
  exit 1
fi

if ! /usr/bin/security find-identity -v -p codesigning | /usr/bin/grep -Fq '"Torvi Local Development"'; then
  echo "Torvi Local Development is not available to codesign in this Terminal session." >&2
  echo "Run setup-macos-local-signing.sh first, then try again." >&2
  exit 1
fi

# Close only the two known product processes before replacing their bundles.
/usr/bin/pkill -x "Torvi" 2>/dev/null || true
/usr/bin/pkill -x "Live Copilot" 2>/dev/null || true
/bin/sleep 1

echo "Signing Torvi 0.6.1 with the stable local identity..."
zsh "${script_directory}/sign-macos-app.sh" "$source_app"
zsh "${script_directory}/verify-macos-permission-identity.sh" "$source_app"

/bin/mkdir -p "$backup_directory"

if [[ -d "$legacy_app" ]]; then
  legacy_backup="${backup_directory}/Live Copilot-${backup_suffix}.app"
  echo "Moving the legacy app to: ${legacy_backup}"
  /bin/mv "$legacy_app" "$legacy_backup"
fi

if [[ -d "$installed_app" ]]; then
  installed_backup="${backup_directory}/Torvi-${backup_suffix}.app"
  echo "Moving the previous installed Torvi to: ${installed_backup}"
  /bin/mv "$installed_app" "$installed_backup"
fi

echo "Installing the signed app at ${installed_app}..."
/usr/bin/ditto "$source_app" "$installed_app"
/usr/bin/xattr -dr com.apple.quarantine "$installed_app" 2>/dev/null || true

zsh "${script_directory}/verify-macos-permission-identity.sh" "$installed_app"

echo "Resetting the stale Screen & System Audio permission record once..."
/usr/bin/tccutil reset ScreenCapture com.interviewcopilot.desktop

echo
echo "Installed the stable local build successfully: ${installed_app}"
echo "When Torvi opens, grant System Audio once, then use Restart Torvi once."
/usr/bin/open "$installed_app"
