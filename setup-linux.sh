#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Keep installation self-contained and avoid broken/root-owned global npm
# caches. The directory is already covered by .gitignore via .relay-browser/.
export NPM_CONFIG_CACHE="$ROOT_DIR/.relay-browser/npm-cache"

# Self-update: pull latest before doing anything else so a stale clone can
# never block setup. Non-fatal if offline, diverged, or not a git repo.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "==> Pulling latest from origin/main"
  git pull --ff-only >/dev/null 2>&1 || \
    echo "    (pull skipped — offline, diverged, or no upstream; continuing with current tree)"
fi

NO_BROWSER=0
if [[ "${1:-}" == "--no-browser" ]]; then
  NO_BROWSER=1
elif [[ $# -gt 0 ]]; then
  echo "Usage: ./setup-linux.sh [--no-browser]" >&2
  exit 2
fi

for command_name in node npm git; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "ERROR: '$command_name' is required but was not found." >&2
    exit 1
  fi
done

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 22 )); then
  echo "ERROR: Node.js 22 or newer is required; found $(node --version)." >&2
  exit 1
fi

echo "==> Installing project dependencies"
npm install

if [[ ! -e .env ]]; then
  echo "==> Creating local .env from .env.example"
  cp .env.example .env
else
  echo "==> Keeping existing local .env"
fi

echo "==> Checking types and running unit tests"
npm run typecheck
npm test

echo "==> Simulating a real startup with the preferred port occupied"
npm run smoke:startup

if (( NO_BROWSER == 1 )); then
  echo "==> Browser probe skipped (--no-browser)"
else
  echo "==> Starting the ChatGPT browser authentication and live probe"
  npm run probe:chatgpt

  echo "==> Installing and starting the per-user background relay service"
  npm run service:install

  if command -v hermes >/dev/null 2>&1; then
    echo "==> Configuring the installed Hermes agent"
    npm run hermes:configure
  else
    echo "==> Hermes was not found; skipping Hermes configuration"
    echo "    Install Hermes later, then run: npm run hermes:configure"
  fi
fi

echo
if (( NO_BROWSER == 1 )); then
  echo "SIMULATION COMPLETE (browser, service, and Hermes stages intentionally skipped)"
else
  echo "SETUP COMPLETE"
  echo "Relay status: systemctl --user status local-ai-relay"
  echo "Relay logs:   journalctl --user -u local-ai-relay -f"
fi
