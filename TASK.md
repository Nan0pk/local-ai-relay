# Current task: Phase U9 — OpenAPI 3.1 Specification & SDK Compatibility (v0.9.0)

**Status:** In Progress  
**Priority:** Generate OpenAPI 3.1 specification and verify multi-client SDK compatibility  
**Estimate:** 1 engineering day  
**Deliverable:** `src/routes/openapi.ts`, `docs/openapi.json`, and compatibility test suite on `main`

## Goal

1. **OpenAPI 3.1 Specification Generator (`src/routes/openapi.ts`):** Generate valid OpenAPI 3.1 schema documenting loopback API contracts (`/health`, `/v1/models`, `/v1/responses`, `/v1/chat/completions`).
2. **OpenAPI Test Suite (`src/routes/openapi.test.ts`):** Verify OpenAPI document generation and schema compliance.

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

1. Create `src/routes/openapi.ts` and `src/routes/openapi.test.ts`.
2. Run full 8-command baseline test suite.

## Acceptance

Deterministic:
- `npm run typecheck` passes with 0 errors.
- All unit and delivery tests pass.
- Full 8-command baseline passes 100%.
