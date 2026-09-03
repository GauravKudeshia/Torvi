#!/bin/zsh
set -euo pipefail

# One-time local development setup. This identity is only for builds used on
# this Mac; it is not a substitute for Developer ID signing and notarization.
identity_name="${MACOS_SIGNING_IDENTITY:-Torvi Local Development}"
login_keychain="$(/usr/bin/security login-keychain -d user 2>/dev/null || true)"
login_keychain="$(print -r -- "$login_keychain" | /usr/bin/tr -d '"[:space:]')"

# `security login-keychain` can return an empty result on newer macOS releases
# even when the login Keychain exists. Fall back to the user's default
# Keychain so the setup never fails silently before presenting its prompt.
if [[ -z "$login_keychain" ]]; then
  login_keychain="$(/usr/bin/security default-keychain -d user | /usr/bin/tr -d '"[:space:]')"
fi
if [[ -z "$login_keychain" || ! -f "$login_keychain" ]]; then
  echo "Could not locate the user's login Keychain." >&2
  exit 1
fi

if /usr/bin/security find-identity -v -p codesigning "$login_keychain" | /usr/bin/grep -Fq "\"${identity_name}\""; then
  echo "Code-signing identity already exists: ${identity_name}"
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL is required to create the local development identity." >&2
  exit 1
fi

temporary_directory="$(/usr/bin/mktemp -d /private/tmp/interview-copilot-signing.XXXXXX)"
trap '/bin/rm -rf -- "$temporary_directory"' EXIT

if [[ ! -r /dev/tty ]]; then
  echo "Run this setup from an interactive Terminal window." >&2
  exit 1
fi
read -r -s "keychain_password?Enter your normal Mac login password once to import the local signing identity: " < /dev/tty
echo
archive_password="$(openssl rand -hex 24)"

/bin/cat > "${temporary_directory}/certificate.conf" <<EOF
[req]
distinguished_name = subject
x509_extensions = extensions
prompt = no

[subject]
CN = ${identity_name}
O = Torvi Local Development

[extensions]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
EOF

openssl req -new -newkey rsa:2048 -nodes -x509 -days 3650 \
  -config "${temporary_directory}/certificate.conf" \
  -keyout "${temporary_directory}/identity.key" \
  -out "${temporary_directory}/identity.crt"
openssl pkcs12 -export \
  -inkey "${temporary_directory}/identity.key" \
  -in "${temporary_directory}/identity.crt" \
  -name "$identity_name" \
  -legacy \
  -passout "pass:${archive_password}" \
  -out "${temporary_directory}/identity.p12"

/usr/bin/security import "${temporary_directory}/identity.p12" \
  -k "$login_keychain" \
  -P "$archive_password" \
  -T /usr/bin/codesign
/usr/bin/security add-trusted-cert -r trustRoot -p codeSign -k "$login_keychain" "${temporary_directory}/identity.crt"
/usr/bin/security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$keychain_password" \
  "$login_keychain" >/dev/null

unset keychain_password archive_password

if ! /usr/bin/security find-identity -v -p codesigning "$login_keychain" | /usr/bin/grep -Fq "\"${identity_name}\""; then
  echo "The identity was imported but is not available to codesign." >&2
  exit 1
fi

echo "Created stable local code-signing identity: ${identity_name}"
echo "Use it only for local Mac testing. Public releases require Developer ID Application signing and notarization."
