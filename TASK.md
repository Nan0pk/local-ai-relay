# Current task: Phase U6 — Enterprise Systemd Operations & Load Balancing (v0.6.0)

**Status:** In Progress  
**Priority:** Implement systemd user service installer and multi-provider failover matrix  
**Estimate:** 1 engineering day  
**Deliverable:** 1 consolidated pull request for Phase U6

## Goal

1. **Systemd User Service Installer (`src/cli/install-service.ts`):** Generate, install, enable, and start `~/.config/systemd/user/local-ai-relay.service` with automatic restart policy.
2. **Multi-Provider Priority Failover (`src/router/model-router.ts`):** Dynamic multi-provider fallback matrix routing across all 11 providers when primary provider is degraded or rate-limited.

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

1. Verify `install-service.ts` unit tests and systemd service generator.
2. Verify priority fallback ordering in `model-router.ts` across provider statuses.

## Acceptance

Deterministic:
- `npm run typecheck` passes with 0 errors.
- All unit and delivery tests pass cleanly.
- Full 8-command baseline passes 100%.
