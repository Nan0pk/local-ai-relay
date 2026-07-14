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
#   - exists, broken      -> preserve as a timestamped backup, then clone
#
# It never asks the user to manually git pull, rm -rf, or git clone.
# Destructive replacement requires the explicit pair --fresh --yes.

set -Eeuo pipefail

REPO="${RELAY_REPO:-https://github.com/Nan0pk/local-ai-relay.git}"
DIR="${RELAY_DIR:-$HOME/local-ai-relay}"
FRESH=0
YES=0
SETUP_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fresh)    FRESH=1; shift ;;
    --yes)      YES=1; shift ;;
    --no-browser) SETUP_ARGS+=("$1"); shift ;;
    *)          SETUP_ARGS+=("$1"); shift ;;
  esac
done

say()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[32m%s\033[0m\n' "$*"; }
warn() { printf '    \033[33m%s\033[0m\n' "$*"; }

canonical_repo() {
  printf '%s' "$1" \
    | sed -E 's#^git@github\.com:#github.com/#; s#^(https?://)?(www\.)?github\.com/##; s#\.git/?$##; s#/$##' \
    | tr '[:upper:]' '[:lower:]'
}

EXPECTED_REPOSITORY="${RELAY_EXPECTED_REPOSITORY:-Nan0pk/local-ai-relay}"
if [[ "$(canonical_repo "$REPO")" != "$(canonical_repo "$EXPECTED_REPOSITORY")" ]]; then
  echo "FAIL: repository '$REPO' does not match expected GitHub repository '$EXPECTED_REPOSITORY'." >&2
  exit 2
fi

backup_target() {
  local backup="${DIR}.backup-$(date -u +%Y%m%dT%H%M%SZ)"
  local suffix=1
  while [[ -e "$backup" ]]; do backup="${backup}-${suffix}"; suffix=$((suffix + 1)); done
  say "Preserving existing directory as $backup"
  mv "$DIR" "$backup"
  ok 'local environment, diagnostics, logs, and patches preserved'
}

if (( FRESH == 1 && YES != 1 )); then
  echo 'FAIL: --fresh deletes the target directory and therefore also requires --yes.' >&2
  exit 2
fi

# Decide what to do with the target directory.
ACTION='clone'
if [[ -d "$DIR" ]]; then
  if (( FRESH == 1 && YES == 1 )); then
    say "--fresh --yes requested: deleting $DIR"
    rm -rf "$DIR"
    ACTION='clone'
  elif [[ ! -d "$DIR/.git" ]]; then
    warn "$DIR exists but is not a git repository"
    backup_target
    ACTION='clone'
  else
    ORIGIN="$(git -C "$DIR" remote get-url origin 2>/dev/null || true)"
    if [[ "$(canonical_repo "$ORIGIN")" != "$(canonical_repo "$EXPECTED_REPOSITORY")" ]]; then
      warn "$DIR has unexpected origin '$ORIGIN'; it will not be updated"
      backup_target
      ACTION='clone'
    else
    say "Pulling latest in $DIR"
    if git -C "$DIR" pull --ff-only >/dev/null 2>&1; then
      ACTION='setup'
      ok 'pull succeeded'
    else
      warn 'pull failed; preserving the current checkout and continuing without updating'
      warn 'This can mean offline access, local changes/commits, or a temporary Git failure.'
      ACTION='setup'
    fi
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
