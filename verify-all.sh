#!/usr/bin/env bash
# verify-all.sh — one command to verify every browser provider.
#
#   ./verify-all.sh
#
# What it does:
#   1. Installs deps + browser + tests + build + smoke (setup-linux --no-browser).
#   2. For each of the 9 unverified providers (claude, gemini, deepseek, zai,
#      minimax, kimi, qwen, grok, mistral):
#        a. Opens the dedicated profile (login:<name>).
#        b. Waits for the user to sign in normally and press a key.
#        c. Runs the live probe (probe:<name>).
#        d. Records PASS/FAIL with the conversation URL.
#   3. Prints a final summary table.
#
# The user only runs: ./verify-all.sh
# Everything else is automated. Sign-in is the only manual step, and it's
# a normal browser action the user would do anyway.

set -Eeuo pipefail
cd "$(dirname "$0")"

printf '============================================================\n'
printf ' local-ai-relay — full verification (9 providers)\n'
printf '============================================================\n\n'

# Stage 1: code verification (no browser).
printf '[1/2] Running ./setup-linux.sh --no-browser ...\n'
if ! ./setup-linux.sh --no-browser >/tmp/relay-setup.log 2>&1; then
  cat /tmp/relay-setup.log
  printf '\nFAIL: setup stage failed. Fix the errors above before continuing.\n'
  exit 1
fi
# Show the tail so the user sees the PASS lines.
tail -20 /tmp/relay-setup.log
printf '\n[1/2] Code verification PASS.\n\n'

# Stage 2: per-provider login + probe.
PROVIDERS=(claude gemini deepseek zai minimax kimi qwen grok mistral)
TOTAL=${#PROVIDERS[@]}
PASSED=0
FAILED=0
RESULTS=()

printf '[2/2] Verifying %d providers. A browser window will open for each.\n' "$TOTAL"
printf '      Sign in normally, then come back here and press any key.\n\n'

i=0
for provider in "${PROVIDERS[@]}"; do
  i=$((i + 1))
  printf -- '------------------------------------------------------------\n'
  printf ' [%d/%d] Provider: %s\n' "$i" "$TOTAL" "$provider"
  printf -- '------------------------------------------------------------\n'
  printf 'Opening %s login window ...\n' "$provider"
  npm run "login:$provider" >/dev/null 2>&1 &
  login_pid=$!
  printf '\nSign in to %s in the browser window if you haven'\''t already.\n' "$provider"
  printf 'When the %s composer is visible, come back here and press any key.\n' "$provider"
  read -r -n 1 -s </dev/tty
  kill "$login_pid" 2>/dev/null || true
  wait "$login_pid" 2>/dev/null || true
  printf '\nRunning %s probe ...\n' "$provider"
  if npm run "probe:$provider"; then
    PASSED=$((PASSED + 1))
    RESULTS+=("$provider PASS")
    printf '\n[%s] PASS\n' "$provider"
  else
    FAILED=$((FAILED + 1))
    RESULTS+=("$provider FAIL")
    printf '\n[%s] FAIL — see error above. Continuing to next provider.\n' "$provider"
  fi
  printf '\n'
done

printf '============================================================\n'
printf ' SUMMARY\n'
printf '============================================================\n'
printf ' Total:   %d\n' "$TOTAL"
printf ' Passed:  %d\n' "$PASSED"
printf ' Failed:  %d\n' "$FAILED"
printf '\n Per-provider:\n'
for r in "${RESULTS[@]}"; do
  printf '  %s\n' "$r"
done
printf '============================================================\n\n'
printf 'Paste the SUMMARY block above back to the assistant.\n'
printf 'For any FAIL, also paste the error output for that provider.\n'
exit "$FAILED"
