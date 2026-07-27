# Current task: U4-01 — Production rate limiting & health monitoring

**Status:** Open  
**Priority:** add rate-limiting middleware and health monitoring endpoints  
**Estimate:** 1 engineering day  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Implement sliding-window rate-limiting middleware (`src/middleware/rate-limit.ts`) and enhanced health monitoring diagnostics.

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

1. **Rate-Limiting Middleware (`src/middleware/rate-limit.ts`):** Implement in-memory sliding window rate limiter configurable via environment variables (`RELAY_MAX_REQUESTS_PER_MINUTE`).
2. **Unit Tests (`src/middleware/rate-limit.test.ts`):** Verify 429 response emission when request quota is exceeded.

## Acceptance

Deterministic:
- `npm test` passes rate-limiting tests.
- Full 8-command baseline passes.
