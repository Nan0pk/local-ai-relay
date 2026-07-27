# Current task: U3-01 — Multi-provider expansion (Gemini & DeepSeek adapters)

**Status:** Open  
**Priority:** verify Gemini and DeepSeek browser adapters and registration  
**Estimate:** 1 engineering day  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Verify Gemini (`browser-gemini-free`) and DeepSeek (`browser-deepseek-free`) browser provider adapters, nonced tool schema handling, and capability registration.

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

1. **Gemini & DeepSeek Adapters:** Verify `GeminiBrowserProvider` (`src/providers/gemini-browser.ts`) and `DeepSeekBrowserProvider` (`src/providers/deepseek-browser.ts`).
2. **Capability Registration:** Ensure capability tracker handles `browser-gemini` and `browser-deepseek`.

## Acceptance

Deterministic:
- `npm test` passes all provider tests.
- Full 8-command baseline passes.
