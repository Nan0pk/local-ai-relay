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
SERVICE_UNIT="$HOME/.config/systemd/user/local-ai-relay.service"

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
  local name="$1"
  local -a lines=()
  [[ -e "$INSTALL_ROOT/$name" || -L "$INSTALL_ROOT/$name" ]] || return 3
  [[ -f "$INSTALL_ROOT/$name" ]] || return 4
  mapfile -t lines <"$INSTALL_ROOT/$name"
  [[ ${#lines[@]} -eq 1 ]] || return 4
  [[ "${lines[0]}" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || return 4
  printf '%s' "${lines[0]}"
}

activate_service() {
  # service:install writes the unit, restarts it, and waits for /health.
  (cd "$1" && npm run service:install)
}

snapshot_state() {
  local snapshot="$1" name
  mkdir "$snapshot"
  for name in current previous service-managed; do
    if [[ -e "$INSTALL_ROOT/$name" ]]; then
      [[ -f "$INSTALL_ROOT/$name" ]] || return 1
      cp "$INSTALL_ROOT/$name" "$snapshot/$name"
      : >"$snapshot/$name.exists"
    fi
  done
}

restore_state() {
  local snapshot="$1" name temporary
  for name in current previous service-managed; do
    if [[ -f "$snapshot/$name.exists" ]]; then
      temporary="$INSTALL_ROOT/.${name}.restore.$$"
      cp "$snapshot/$name" "$temporary" && mv -f "$temporary" "$INSTALL_ROOT/$name" || return 1
    else
      rm -f "$INSTALL_ROOT/$name" || return 1
    fi
  done
}

maybe_fail_finalization() {
  [[ "${RELAY_TEST_FAIL_FINALIZE_AFTER:-}" != "$1" ]] || {
    echo "FAIL: injected finalization failure after $1." >&2
    return 70
  }
}

validate_release_payload() {
  local root="$1"
  [[ -f "$root/package.json" &&
    -f "$root/package-lock.json" &&
    -x "$root/setup-linux.sh" &&
    -f "$root/dist/index.js" &&
    -f "$root/.env" ]] || return 1
  if [[ -L "$root/.env" ]]; then
    [[ "$(readlink "$root/.env")" == "$INSTALL_ROOT/config/.env" ]] || return 1
  fi
}

validate_installed_release() {
  local version="$1" root="$INSTALL_ROOT/versions/$1" marker
  validate_release_payload "$root" && [[ -f "$root/.authenticated-release" ]] || return 1
  IFS= read -r marker <"$root/.authenticated-release"
  [[ "$marker" == "$version" && "$(wc -l <"$root/.authenticated-release")" -eq 1 ]]
}

read_managed_version() {
  read_pointer service-managed
}

deactivate_new_service() {
  systemctl --user disable --now local-ai-relay.service &&
    rm -f "$SERVICE_UNIT" &&
    systemctl --user daemon-reload
}

if ((ROLLBACK)); then
  if current="$(read_pointer current)"; then
    :
  elif [[ $? -eq 3 ]]; then
    echo 'FAIL: no active release to roll back.' >&2
    exit 1
  else
    echo 'FAIL: current release pointer is malformed.' >&2
    exit 1
  fi
  if previous="$(read_pointer previous)"; then
    :
  elif [[ $? -eq 3 ]]; then
    echo 'FAIL: no previous release to roll back to.' >&2
    exit 1
  else
    echo 'FAIL: previous release pointer is malformed.' >&2
    exit 1
  fi
  validate_installed_release "$previous" || {
    echo "FAIL: previous release $previous is not an authenticated runnable installation." >&2
    exit 1
  }
  service_was_managed=0
  if [[ -e "$INSTALL_ROOT/service-managed" || -L "$INSTALL_ROOT/service-managed" ]]; then
    managed_version="$(read_managed_version)" || {
      echo 'FAIL: managed-service state is malformed.' >&2
      exit 1
    }
    [[ "$managed_version" == "$current" ]] || {
      echo "FAIL: managed-service state $managed_version does not match current $current." >&2
      exit 1
    }
    validate_installed_release "$current" || {
      echo "FAIL: current recovery release $current is not an authenticated runnable installation." >&2
      exit 1
    }
    service_was_managed=1
  fi
  rollback_snapshot="$(mktemp -d "$INSTALL_ROOT/.staging/rollback.XXXXXX")"
  trap 'rm -rf "$rollback_snapshot"' EXIT INT TERM
  snapshot_state "$rollback_snapshot/state" || { echo 'FAIL: could not snapshot install state.' >&2; exit 1; }
  runtime_switched=0
  if ((service_was_managed)); then
    if ! activate_service "$INSTALL_ROOT/versions/$previous"; then
      echo "FAIL: $previous service activation failed; restoring $current." >&2
      activate_service "$INSTALL_ROOT/versions/$current" || {
        echo "FAIL: prior service restoration also failed; pointers remain unchanged." >&2
        exit 1
      }
      exit 1
    fi
    runtime_switched=1
  fi
  if ! {
    write_pointer previous "$current" &&
    maybe_fail_finalization previous &&
    if ((service_was_managed)); then
      write_pointer service-managed "$previous" && maybe_fail_finalization service-managed
    fi &&
    write_pointer current "$previous" &&
    maybe_fail_finalization current
  }; then
    restore_state "$rollback_snapshot/state" || echo 'FAIL: install-state restoration failed.' >&2
    if ((runtime_switched)); then
      activate_service "$INSTALL_ROOT/versions/$current" || \
        echo 'FAIL: prior service restoration also failed.' >&2
    fi
    echo 'FAIL: rollback finalization failed; prior state restored.' >&2
    exit 1
  fi
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
validate_release_payload "$destination" || {
  echo "FAIL: release $VERSION setup did not produce a complete runnable installation." >&2
  exit 1
}
printf '%s\n' "$VERSION" >"$destination/.authenticated-release"

if old_current="$(read_pointer current)"; then
  :
elif [[ $? -eq 3 ]]; then
  old_current=''
else
  echo 'FAIL: current release pointer is malformed.' >&2
  exit 1
fi
install_snapshot="$stage/install-state"
snapshot_state "$install_snapshot" || { echo 'FAIL: could not snapshot install state.' >&2; exit 1; }
service_was_managed=0
if [[ -e "$INSTALL_ROOT/service-managed" || -L "$INSTALL_ROOT/service-managed" ]]; then
  managed_version="$(read_managed_version)" || {
    echo 'FAIL: managed-service state is malformed.' >&2
    exit 1
  }
  [[ -n "$old_current" && "$managed_version" == "$old_current" ]] || {
    echo "FAIL: managed-service state $managed_version does not match current ${old_current:-<missing>}." >&2
    exit 1
  }
  validate_installed_release "$old_current" || {
    echo "FAIL: current recovery release $old_current is not an authenticated runnable installation." >&2
    exit 1
  }
  service_was_managed=1
elif ((NO_BROWSER == 0)) && [[ -e "$SERVICE_UNIT" || -L "$SERVICE_UNIT" ]]; then
  echo "FAIL: refusing to overwrite unmanaged service unit $SERVICE_UNIT." >&2
  exit 1
fi
runtime_switched=0
if ((service_was_managed || NO_BROWSER == 0)); then
  # Retain the target until activation either succeeds or the prior runtime is
  # known-good again; a service unit may already reference this directory.
  new_destination=''
  if ! activate_service "$destination"; then
    restored=0
    if ((service_was_managed)) && [[ -n "$old_current" && -d "$INSTALL_ROOT/versions/$old_current" ]]; then
      activate_service "$INSTALL_ROOT/versions/$old_current" && restored=1
    elif deactivate_new_service; then
      restored=1
    fi
    if ((restored)); then
      rm -rf "$destination"
    else
      echo "FAIL: retaining $destination because service restoration was not confirmed." >&2
    fi
    echo 'FAIL: release service activation failed; pointers remain unchanged.' >&2
    exit 1
  fi
  runtime_switched=1
else
  new_destination=''
fi

if ! {
  if [[ -n "$old_current" && "$old_current" != "$VERSION" ]]; then
    write_pointer previous "$old_current" && maybe_fail_finalization previous
  fi &&
  if ((runtime_switched)); then
    write_pointer service-managed "$VERSION" && maybe_fail_finalization service-managed
  fi &&
  write_pointer current "$VERSION" &&
  maybe_fail_finalization current
}; then
  state_restored=0
  if restore_state "$install_snapshot"; then
    state_restored=1
  else
    echo 'FAIL: install-state restoration failed.' >&2
  fi
  restored_runtime=0
  if ((service_was_managed)) && [[ -n "$old_current" && -d "$INSTALL_ROOT/versions/$old_current" ]]; then
    activate_service "$INSTALL_ROOT/versions/$old_current" && restored_runtime=1
  elif ((runtime_switched)) && deactivate_new_service; then
    restored_runtime=1
  elif ((runtime_switched == 0)); then
    restored_runtime=1
  fi
  if ((state_restored && restored_runtime)); then
    rm -rf "$destination"
  else
    echo "FAIL: retaining $destination because full restoration was not confirmed." >&2
  fi
  echo 'FAIL: release finalization failed; prior state restored.' >&2
  exit 1
fi

if ((NO_BROWSER == 0)) && command -v hermes >/dev/null 2>&1; then
  (cd "$destination" && npm run hermes:configure) || \
    echo 'WARN: release installed, but Hermes configuration failed.' >&2
fi
echo "Installed authenticated release $VERSION at $destination."
