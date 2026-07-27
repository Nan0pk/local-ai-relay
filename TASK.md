# Current task: U5-01 — Automated Cron Health Monitoring & Diagnostic Polling

**Status:** In Progress  
**Priority:** Implement scheduled health monitoring script and diagnostic polling  
**Estimate:** 1 engineering day  
**Deliverable:** `scripts/scheduled-health-check.ts` and automated diagnostic test suite

## Goal

Implement automated health monitoring script `scripts/scheduled-health-check.ts` to poll `/health` and `/v1/providers/status`, writing structured diagnostics to `$RELAY_INSTALL_ROOT/diagnostics/health-audit.json`.

## Baseline

Run and record before editing:

```bash
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run smoke:startup
npm run test:delivery
node scripts/validate-release.mjs
```

## Required Work

1. **Scheduled Health Monitoring Script (`scripts/scheduled-health-check.ts`):** Polls loopback relay status and logs JSON audit report.
2. **Integration Test (`src/cli/scheduled-health-check.test.ts`):** Verify health check execution against active/mock server.

## Acceptance

Deterministic:
- `npm run typecheck` passes with 0 errors.
- `npm test` passes all tests cleanly.
- Full 8-command baseline passes.
