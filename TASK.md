# Current task: U2-03 — Publish v0.3.0 release preparation & documentation reconciliation

**Status:** Open  
**Priority:** reconcile v0.3.0 release documentation & release contract  
**Estimate:** 0.5 engineering days  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Reconcile release documentation in `RELEASES.md` for v0.3.0 Web Arena & Model Router release contract, verify SPDX SBOM Patchright provenance attestation, and run baseline validation.

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

1. **v0.3.0 Release Notes (`RELEASES.md`):** Update `RELEASES.md` with v0.3.0 release notes documenting Web Arena adapter (`browser-arena-free`), pairwise prompt evaluation harness (`src/eval/arena-eval.ts`), heuristic model router (`src/router/model-router.ts`), and alias routing (`auto`, `fast`, `smart`).
2. **Release Asset Validation:** Ensure `node scripts/validate-release.mjs` executes cleanly.

## Acceptance

Deterministic:
- Full 8-command baseline passes.
- `RELEASES.md` contains v0.3.0 contract.
