# Current task: ship the local Control Center

**Status:** Complete locally on `agent/control-center`, awaiting stacked PR CI
and maintainer-run authenticated provider sessions.
**Priority:** Give newcomers a practical local GUI for provider sign-in,
readiness, routing, diagnostics, and reversible harness integration.

## Goal

Build an authenticated, CSP-safe dashboard; persistent automatic/manual/priority
routing with failover; provider connection jobs and redacted activity; optional
browser-companion status; scoped harness credentials; disconnect-one/all
cleanup; generic harness onboarding; a one-command dashboard launcher; tests,
OpenAPI, and newcomer documentation.

## Baseline

The parent branch `fix/validate-v2-surfaces` passed `npm run verify` and GitHub
Actions on Ubuntu and Windows. Authenticated live browser probes remain
operator-run because provider credentials and a graphical login session are not
available in CI.

## Acceptance

```bash
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run smoke:startup
npm run test:delivery
node scripts/validate-release.mjs
npm audit --omit=dev
```

All deterministic commands must pass. The final report must separately name
the authenticated live-provider evidence that remains unavailable.

## Acceptance behavior

- The dashboard shell/assets are public but all state and actions require auth.
- The bearer token is never persisted in Web Storage.
- `relay-auto` selects only allowed ready/degraded providers and logs failover.
- Provider Connect opens the isolated profile and persists only verified
  readiness evidence; manual login controls remain manual.
- Harness connections use separate revocable tokens.
- Disconnect removes only relay-owned config and restores prior Hermes choice.
- Existing-browser companion status must not be represented as inference.
- Full deterministic acceptance remains `npm run verify`.
