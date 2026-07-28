# Current task: verify and harden the advertised v2 surfaces

**Status:** Complete locally on `fix/validate-v2-surfaces`; awaiting CI and
maintainer live-provider sessions.
**Priority:** Make repository claims match executable behavior and fail fast
where an integration is not ready.

## Goal

Audit current `main`, reproduce its deterministic baseline, repair every
reproducible defect found in the recently added dashboard, MCP, Native
Messaging, OpenAPI, container, startup, security, and documentation surfaces,
and publish one draft pull request with exact test evidence.

## Baseline

The clean `0d95884bb06d2d46e5e9af77859629544b0adabe` baseline passed the
eight deterministic commands after npm was pointed at a writable cache.
Authenticated live browser probes were not runnable in the credential-free,
non-graphical verification environment and must not be represented as passed.

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

## Final local evidence

- `npm ci`: pass from the committed lockfile.
- `npm run verify`: pass.
- Unit/integration: 337 total, 327 passed, 10 Windows-only skipped on Linux.
- Deterministic mock E2E: 62/62 passed.
- Delivery: 31 total, 21 passed, 10 Windows-only skipped on Linux.
- Startup: occupied-port fallback, liveness, active-port record, and completion
  round trip passed.
- Release validator: 8 deterministic authenticated assets validated.
- Production dependency audit: 0 vulnerabilities.

Docker engine, a graphical browser session, authenticated provider profiles,
and a Windows runner are unavailable in the local verification environment.
Docker/Windows contracts have deterministic tests; GitHub CI supplies both
operating-system jobs. Live readiness remains gated on `npm run probe:all`.
