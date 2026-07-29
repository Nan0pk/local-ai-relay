#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY_URL="${RELAY_SOURCE_REPOSITORY:-https://github.com/Nan0pk/local-ai-relay.git}"
SOURCE_REF="${RELAY_SOURCE_REF:-main}"
INSTALL_ROOT="${RELAY_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/local-ai-relay}"
SOURCE_ROOT="${RELAY_SOURCE_ROOT:-$INSTALL_ROOT/source}"
OPEN_BROWSER=1

usage() {
  cat >&2 <<'EOF'
Usage: start-source.sh [--ref BRANCH_OR_TAG] [--install-root PATH] [--no-open]

Installs or updates the official source checkout, creates an OS launcher, and
opens the Local AI Relay Control Center.
EOF
  exit 2
}

while (($#)); do
  case "$1" in
    --ref)
      [[ $# -ge 2 ]] || usage
      SOURCE_REF="$2"
      shift 2
      ;;
    --install-root)
      [[ $# -ge 2 ]] || usage
      INSTALL_ROOT="$2"
      SOURCE_ROOT="$INSTALL_ROOT/source"
      shift 2
      ;;
    --no-open)
      OPEN_BROWSER=0
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      usage
      ;;
  esac
done

fail() {
  echo "START FAILED: $*" >&2
  exit 1
}

for command_name in git node npm; do
  command -v "$command_name" >/dev/null 2>&1 ||
    fail "required command '$command_name' was not found. Install Git and Node.js 22+, then run this same command again."
done

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')" ||
  fail 'could not determine the Node.js version.'
[[ "$node_major" =~ ^[0-9]+$ && "$node_major" -ge 22 ]] ||
  fail "Node.js 22 or newer is required; found $(node --version 2>/dev/null || echo unknown)."

mkdir -p "$INSTALL_ROOT"
new_checkout=0
if [[ ! -e "$SOURCE_ROOT" ]]; then
  echo "Downloading Local AI Relay..."
  git clone --filter=blob:none --no-checkout "$REPOSITORY_URL" "$SOURCE_ROOT"
  new_checkout=1
elif [[ ! -d "$SOURCE_ROOT/.git" ]]; then
  fail "$SOURCE_ROOT already exists but is not a Local AI Relay source checkout. Move it aside or choose --install-root."
fi

origin_url="$(git -C "$SOURCE_ROOT" remote get-url origin 2>/dev/null || true)"
[[ "$origin_url" == "$REPOSITORY_URL" ]] ||
  fail "$SOURCE_ROOT points to '$origin_url', not the expected official repository '$REPOSITORY_URL'."

if ((new_checkout == 0)) && [[ -n "$(git -C "$SOURCE_ROOT" status --porcelain)" ]]; then
  fail "$SOURCE_ROOT contains local changes. They were preserved; use a different --install-root or clean that checkout yourself."
fi

echo "Updating from $SOURCE_REF..."
git -C "$SOURCE_ROOT" fetch --depth 1 origin "$SOURCE_REF"
git -C "$SOURCE_ROOT" checkout --detach --force FETCH_HEAD

lock_hash="$(git -C "$SOURCE_ROOT" hash-object package-lock.json)"
stamp="$SOURCE_ROOT/node_modules/.local-ai-relay-lock"
if [[ ! -f "$stamp" || "$(tr -d '\r\n' <"$stamp")" != "$lock_hash" ]]; then
  echo 'Installing verified npm dependencies...'
  (cd "$SOURCE_ROOT" && npm ci)
  printf '%s\n' "$lock_hash" >"$stamp"
else
  echo 'Dependencies are already current.'
fi

echo 'Creating the Local AI Relay application launcher...'
(cd "$SOURCE_ROOT" && \
  RELAY_INSTALL_ROOT="$INSTALL_ROOT" \
  RELAY_SOURCE_ROOT="$SOURCE_ROOT" \
  npm run launcher:install)

echo 'Opening the Local AI Relay Control Center...'
if ((OPEN_BROWSER)); then
  (cd "$SOURCE_ROOT" && npm run dashboard -- --replace-running)
else
  (cd "$SOURCE_ROOT" && npm run dashboard -- --no-open --replace-running)
fi
