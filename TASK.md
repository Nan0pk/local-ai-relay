# Current task: Phase U8 — Containerization & Secure Tunneling Infrastructure (v0.8.0)

**Status:** In Progress  
**Priority:** Implement production Docker containerization and Compose orchestration  
**Estimate:** 1 engineering day  
**Deliverable:** `Dockerfile`, `docker-compose.yml`, `.dockerignore`, and baseline verification on `main`

## Goal

1. **Production Dockerfile (`Dockerfile`):** Multi-stage Node 22 container image exposing port 8787 with non-root user security context.
2. **Docker Compose Orchestration (`docker-compose.yml`):** Compose configuration with persistent volume mounts for `.local-ai-relay` tokens and browser profile evidence.
3. **Docker Ignore (`.dockerignore`):** Exclude node_modules, build artifacts, and local diagnostics.

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

1. Create `Dockerfile`, `docker-compose.yml`, `.dockerignore`.
2. Run full 8-command baseline test suite.

## Acceptance

Deterministic:
- `npm run typecheck` passes with 0 errors.
- `npm test` passes all 289+ unit tests.
- Full 8-command baseline passes 100%.
