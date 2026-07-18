#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY='Nan0pk/local-ai-relay'
PLATFORM='linux-x64'
VERSION=''
ROLLBACK=0
SETUP_ARGS=()
NO_BROWSER=0
INSTALL_ROOT="${RELAY_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/local-ai-relay}"
RELEASE_BASE_URL="${RELAY_RELEASE_BASE_URL:-https://github.com/$REPOSITORY/releases/download}"

usage() {
  echo 'Usage: bootstrap.sh --version vX.Y.Z [--no-browser] | --rollback' >&2
  exit 2
}

while (($#)); do
  case "$1" in
    --version)
      [[ $# -ge 2 ]] || usage
      VERSION="$2"
      shift 2
      ;;
    --platform)
      [[ $# -ge 2 ]] || usage
      PLATFORM="$2"
      shift 2
      ;;
    --no-browser)
      SETUP_ARGS+=("$1")
      NO_BROWSER=1
      shift
      ;;
    --rollback)
      ROLLBACK=1
      shift
      ;;
    *)
      usage
      ;;
  esac
done

[[ "$PLATFORM" == 'linux-x64' ]] || { echo "FAIL: unsupported platform: $PLATFORM" >&2; exit 2; }
if ((ROLLBACK)); then
  [[ -z "$VERSION" && ${#SETUP_ARGS[@]} -eq 0 ]] || usage
else
  [[ "$VERSION" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
    echo 'FAIL: --version must be an explicit stable vX.Y.Z tag.' >&2
    exit 2
  }
fi

mkdir -p "$INSTALL_ROOT/versions" "$INSTALL_ROOT/config" "$INSTALL_ROOT/diagnostics" "$INSTALL_ROOT/.staging"

write_pointer() {
  local name="$1" value="$2" temporary
  temporary="$INSTALL_ROOT/.${name}.$$"
  printf '%s\n' "$value" >"$temporary"
  mv -f "$temporary" "$INSTALL_ROOT/$name"
}

read_pointer() {
  local name="$1" value
  [[ -f "$INSTALL_ROOT/$name" ]] || return 1
  IFS= read -r value <"$INSTALL_ROOT/$name"
  [[ "$value" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || return 1
  printf '%s' "$value"
}

activate_service() {
  # service:install writes the unit, restarts it, and waits for /health.
  (cd "$1" && npm run service:install)
}

if ((ROLLBACK)); then
  current="$(read_pointer current)" || { echo 'FAIL: no active release to roll back.' >&2; exit 1; }
  previous="$(read_pointer previous)" || { echo 'FAIL: no previous release to roll back to.' >&2; exit 1; }
  [[ -d "$INSTALL_ROOT/versions/$previous" ]] || {
    echo "FAIL: previous release $previous is unavailable." >&2
    exit 1
  }
  if [[ -f "$INSTALL_ROOT/service-managed" ]]; then
    if ! activate_service "$INSTALL_ROOT/versions/$previous"; then
      echo "FAIL: $previous service activation failed; restoring $current." >&2
      activate_service "$INSTALL_ROOT/versions/$current" || {
        echo "FAIL: prior service restoration also failed; pointers remain unchanged." >&2
        exit 1
      }
      exit 1
    fi
  fi
  write_pointer previous "$current"
  write_pointer current "$previous"
  echo "Rolled back from $current to $previous."
  exit 0
fi

for command_name in curl gh node tar; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "FAIL: required command '$command_name' was not found." >&2
    exit 1
  }
done

artifact="local-ai-relay-${VERSION}-${PLATFORM}.tar.gz"
stage="$(mktemp -d "$INSTALL_ROOT/.staging/${VERSION}.XXXXXX")"
new_destination=''
cleanup() {
  rm -rf "$stage"
  [[ -z "$new_destination" ]] || rm -rf "$new_destination"
}
trap cleanup EXIT INT TERM

for asset in release-manifest.json verify-release.mjs "$artifact"; do
  curl -fsSL "$RELEASE_BASE_URL/$VERSION/$asset" -o "$stage/$asset"
done

# Authentication is deliberately separate from checksums: all executable
# inputs and metadata must have repository-bound GitHub attestation evidence.
for asset in release-manifest.json verify-release.mjs "$artifact"; do
  gh attestation verify "$stage/$asset" \
    --repo "$REPOSITORY" \
    --signer-workflow "$REPOSITORY/.github/workflows/release.yml" \
    --deny-self-hosted-runners >/dev/null
done

node "$stage/verify-release.mjs" \
  --manifest "$stage/release-manifest.json" \
  --artifact "$stage/$artifact" \
  --version "$VERSION" \
  --platform "$PLATFORM"

payload="$stage/payload"
mkdir "$payload"
tar -xzf "$stage/$artifact" -C "$payload"
[[ -x "$payload/setup-linux.sh" ]] || {
  echo 'FAIL: verified artifact has no executable setup-linux.sh.' >&2
  exit 1
}

destination="$INSTALL_ROOT/versions/$VERSION"
[[ ! -e "$destination" ]] || {
  echo "FAIL: release $VERSION is already installed." >&2
  exit 1
}
mv "$payload" "$destination"
new_destination="$destination"

RELAY_VERIFIED_RELEASE=1 \
RELAY_RELEASE_VERSION="$VERSION" \
RELAY_RELEASE_PLATFORM="$PLATFORM" \
RELAY_INSTALL_ROOT="$INSTALL_ROOT" \
  "$destination/setup-linux.sh" "${SETUP_ARGS[@]}"

old_current="$(read_pointer current || true)"
service_was_managed=0
[[ -f "$INSTALL_ROOT/service-managed" ]] && service_was_managed=1
if ((service_was_managed || NO_BROWSER == 0)); then
  # Retain the target until activation either succeeds or the prior runtime is
  # known-good again; a service unit may already reference this directory.
  new_destination=''
  if ! activate_service "$destination"; then
    restored=0
    if ((service_was_managed)) && [[ -n "$old_current" && -d "$INSTALL_ROOT/versions/$old_current" ]]; then
      activate_service "$INSTALL_ROOT/versions/$old_current" && restored=1
    fi
    if ((restored)); then
      rm -rf "$destination"
    else
      echo "FAIL: retaining $destination because service restoration was not confirmed." >&2
    fi
    echo 'FAIL: release service activation failed; pointers remain unchanged.' >&2
    exit 1
  fi
  : >"$INSTALL_ROOT/service-managed"
else
  new_destination=''
fi

if [[ -n "$old_current" && "$old_current" != "$VERSION" ]]; then
  write_pointer previous "$old_current"
fi
write_pointer current "$VERSION"

if ((NO_BROWSER == 0)) && command -v hermes >/dev/null 2>&1; then
  (cd "$destination" && npm run hermes:configure) || \
    echo 'WARN: release installed, but Hermes configuration failed.' >&2
fi
echo "Installed authenticated release $VERSION at $destination."
