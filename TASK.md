# Current task: U1-04 — Publish v0.2.0 beta release preparation

**Status:** Open  
**Priority:** reconcile v0.2.0 beta release documentation & SBOM provenance  
**Estimate:** 0.5 engineering days  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Reconcile release documentation in `RELEASES.md` for v0.2.0 Beta, verify SPDX SBOM Patchright provenance attestation, and run baseline validation.

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

1. **v0.2.0 Beta Release Notes (`RELEASES.md`):** Update `RELEASES.md` with v0.2.0 Beta release notes documenting multi-provider readiness (ChatGPT + Claude Web), provider control CLI verbs, global kill switch, and MV3 extension sidecar.
2. **Release Asset Validation:** Ensure `node scripts/validate-release.mjs` executes cleanly.

## Acceptance

Deterministic:
- Full 8-command baseline passes.
- `RELEASES.md` contains v0.2.0 Beta contract.
