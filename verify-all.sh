#!/usr/bin/env bash
# One-command deterministic verification followed by all authenticated browser
# probes. Sign-in/2FA/CAPTCHA remain normal user actions in isolated profiles.

set -Eeuo pipefail
cd "$(dirname "$0")"

printf '============================================================\n'
printf ' local-ai-relay - complete verification\n'
printf '============================================================\n\n'

command -v node >/dev/null 2>&1 || {
  printf 'ERROR: Node.js 22 or newer is required.\n' >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  printf 'ERROR: npm is required.\n' >&2
  exit 1
}
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" || {
  printf 'ERROR: Node.js 22 or newer is required; found %s.\n' "$(node --version)" >&2
  exit 1
}

printf '[1/2] Installing the lockfile and running deterministic verification.\n'
npm ci
npm run verify

printf '\n[2/2] Running every authenticated browser probe.\n'
printf 'The only manual steps are provider-controlled sign-in, 2FA, or CAPTCHA.\n\n'
npm run probe:all

printf '\nPASS: deterministic and authenticated browser verification completed.\n'
