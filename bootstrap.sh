#!/usr/bin/env bash
# bootstrap.sh - one-liner entry point for Linux / macOS.
#
# Invoke from anywhere (even a machine with nothing cloned):
#
#   curl -fsSL https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/bootstrap.sh | bash
#
# Or save-and-run:
#
#   curl -fsSL https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/bootstrap.sh -o bootstrap.sh
#   bash bootstrap.sh
#
# This script handles every state of ~/local-ai-relay:
#   - does not exist      -> clone, then run setup
#   - exists, healthy     -> pull, then run setup
#   - exists, broken      -> wipe, clone, then run setup
#
# It never asks the user to manually git pull, rm -rf, or git clone.
# Pass --no-browser to skip the browser probe stage; --fresh to force wipe.

set -Eeuo pipefail

REPO="${RELAY_REPO:-https://github.com/Nan0pk/local-ai-relay.git}"
DIR="${RELAY_DIR:-$HOME/local-ai-relay}"
FRESH=0
SETUP_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fresh)    FRESH=1; shift ;;
    --no-browser) SETUP_ARGS+=("$1"); shift ;;
    *)          SETUP_ARGS+=("$1"); shift ;;
  esac
done

say()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[32m%s\033[0m\n' "$*"; }
warn() { printf '    \033[33m%s\033[0m\n' "$*"; }

# Decide what to do with the target directory.
ACTION='clone'
if [[ -d "$DIR" ]]; then
  if [[ $FRESH -eq 1 ]]; then
    say "--fresh requested: wiping $DIR"
    rm -rf "$DIR"
    ACTION='clone'
  elif [[ ! -d "$DIR/.git" ]]; then
    say "$DIR exists but is not a git repo - wiping and re-cloning"
    rm -rf "$DIR"
    ACTION='clone'
  else
    say "Pulling latest in $DIR"
    if git -C "$DIR" pull --ff-only >/dev/null 2>&1; then
      ACTION='setup'
      ok 'pull succeeded'
    else
      warn 'pull failed - wiping and re-cloning for a clean start'
      rm -rf "$DIR"
      ACTION='clone'
    fi
  fi
fi

if [[ "$ACTION" == 'clone' ]]; then
  say "Cloning $REPO into $DIR"
  if ! git clone "$REPO" "$DIR"; then
    echo "FAIL: git clone failed. Check your network and the repo URL: $REPO" >&2
    exit 1
  fi
fi

cd "$DIR"

# Make sure setup-linux.sh exists; if not, pull once more (belt + suspenders).
if [[ ! -f setup-linux.sh ]]; then
  say 'setup-linux.sh missing - pulling latest'
  git pull --ff-only >/dev/null 2>&1 || true
fi

if [[ ! -f setup-linux.sh ]]; then
  echo 'FAIL: setup-linux.sh still missing after pull. The repo may be on a branch without it.' >&2
  exit 1
fi

say 'Running setup-linux.sh'
exec ./setup-linux.sh "${SETUP_ARGS[@]}"
