#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

[[ "${RELAY_VERIFIED_RELEASE:-}" == 1 ]] || {
  echo 'ERROR: setup-linux.sh must run from an authenticated release bootstrap.' >&2
  exit 1
}
[[ "${RELAY_RELEASE_VERSION:-}" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo 'ERROR: invalid or missing release version context.' >&2
  exit 1
}
[[ "${RELAY_RELEASE_PLATFORM:-}" == 'linux-x64' ]] || {
  echo 'ERROR: invalid or missing linux-x64 release platform context.' >&2
  exit 1
}
[[ -n "${RELAY_INSTALL_ROOT:-}" ]] || {
  echo 'ERROR: missing installation root context.' >&2
  exit 1
}

NO_BROWSER=0
if [[ "${1:-}" == '--no-browser' ]]; then
  NO_BROWSER=1
elif (($#)); then
  echo 'Usage: setup-linux.sh [--no-browser]' >&2
  exit 2
fi

for command_name in node npm; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "ERROR: '$command_name' is required but was not found." >&2
    exit 1
  }
done

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if ((NODE_MAJOR < 22)); then
  echo "ERROR: Node.js 22 or newer is required; found $(node --version)." >&2
  exit 1
fi

export NPM_CONFIG_CACHE="$RELAY_INSTALL_ROOT/cache/npm"
mkdir -p "$NPM_CONFIG_CACHE" "$RELAY_INSTALL_ROOT/config"

CONFIG_FILE="$RELAY_INSTALL_ROOT/config/.env"
if [[ ! -f "$CONFIG_FILE" ]]; then
  cp .env.example "$CONFIG_FILE"
fi
ln -s "$CONFIG_FILE" .env

echo '==> Installing locked project dependencies'
npm ci

echo '==> Checking types and running unit tests'
npm run typecheck
npm test
npm run smoke:startup

if ((NO_BROWSER)); then
  echo 'SIMULATION COMPLETE (browser activation intentionally skipped)'
  exit 0
fi

npm run probe:chatgpt
echo 'SETUP VALIDATION COMPLETE'
