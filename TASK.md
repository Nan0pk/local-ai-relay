# Current task: U2-01 — Web Arena adapter & pairwise evaluation harness

**Status:** Open  
**Priority:** implement Web Arena adapter and pairwise prompt evaluation harness  
**Estimate:** 1 engineering day  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Implement the Web Arena browser adapter (`src/providers/arena-browser.ts`) and pairwise prompt evaluation script (`scripts/arena-eval.ts`).

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

1. **Web Arena Adapter (`src/providers/arena-browser.ts`):** Verify `ArenaBrowserProvider` implementation supporting `browser-arena` model ID and dual-response parsing.
2. **Pairwise Evaluation CLI (`scripts/arena-eval.ts`):** Implement CLI tool for automated blind pairwise prompt evaluation across browser providers.

## Acceptance

Deterministic:
- `npm test` passes Arena browser tests.
- Full 8-command baseline passes.
