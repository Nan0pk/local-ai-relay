# Current task: U2-02 — Heuristic model router & fallback chain

**Status:** Open  
**Priority:** implement heuristic model router selecting best ready provider with fallback chain  
**Estimate:** 1 engineering day  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Implement the heuristic model router (`src/router/model-router.ts`) and fallback chain selecting the best ready provider based on capability readiness and task constraints.

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

1. **Heuristic Router (`src/router/model-router.ts`):** Implement `selectBestReadyModel()` routing requested model alias (e.g. `auto`, `fast`, `smart`) to active ready provider models.
2. **Unit Tests (`src/router/model-router.test.ts`):** Verify routing choices under ready, degraded, and disabled provider capability states.

## Acceptance

Deterministic:
- `npm test` passes model router unit tests.
- Full 8-command baseline passes.
