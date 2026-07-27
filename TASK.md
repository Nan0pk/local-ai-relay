# Current task: U1-02 — Secondary stable browser backend (Claude Web adapter)

**Status:** Open  
**Priority:** add second stable web browser adapter to validate multi-provider browser abstraction  
**Estimate:** 1 engineering day  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Implement the secondary stable browser backend adapter for Claude Web (`src/providers/claude.ts`), nonced tool schema handling, sticky session continuation, and capability registration.

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

1. **Claude Provider Adapter (`src/providers/claude.ts`):** Implement `claudeProvider` implementing `BrowserProvider` interface with model ID `claude-web`, batch transport metadata, nonced tool schema injection, and sticky session continuation.
2. **Capability Registration:** Register `claude-web` in capability tracker and default model listing.
3. **Unit & Integration Tests (`src/providers/claude.test.ts`):** Verify first-turn batch submission, delta continuation, nonced tool envelope parsing, and typed `BrowserFailure` handling.

## Acceptance

Deterministic:
- `npm test` passes all Claude provider unit tests.
- Full 8-command baseline passes cleanly.
