#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

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
fi

echo
echo "SETUP COMPLETE"
echo "Start the relay from this directory with: npm start"
