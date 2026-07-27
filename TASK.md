# Current task: U3-02 — Secondary provider pool verification

**Status:** Open  
**Priority:** verify secondary provider pool (Minimax, Qwen, Z.ai, Grok, Kimi, Mistral, Meta)  
**Estimate:** 1 engineering day  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Verify all 7 secondary browser provider adapters (Minimax, Qwen, Z.ai, Grok, Kimi, Mistral, Meta), nonced tool schema envelope translation, and capability tracker registration.

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

1. **Secondary Providers Matrix:** Verify `MinimaxBrowserProvider`, `QwenBrowserProvider`, `ZaiBrowserProvider`, `GrokBrowserProvider`, `KimiBrowserProvider`, `MistralBrowserProvider`, and `MetaBrowserProvider`.
2. **Capability Registration:** Ensure capability tracker handles all 7 secondary providers cleanly.

## Acceptance

Deterministic:
- `npm test` passes all 286+ unit tests across the provider matrix.
- Full 8-command baseline passes.
