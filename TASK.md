# Current task: U4-02 — Final release verification v0.5.0 General Availability (GA)

**Status:** Completed  
**Priority:** publish final v0.5.0 General Availability release contract  
**Estimate:** 0.5 engineering days  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Final release verification for v0.5.0 General Availability (GA) release contract, reconciling full release documentation in `RELEASES.md`, verifying SPDX SBOM Patchright provenance attestation, and running 100% baseline verification.

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

1. **v0.5.0 GA Release Notes (`RELEASES.md`):** Update `RELEASES.md` with final v0.5.0 GA release notes.
2. **Release Asset Validation:** Ensure `node scripts/validate-release.mjs` executes cleanly for all 8 release assets.

## Acceptance

Deterministic:
- Full 8-command baseline passes 100%.
- `RELEASES.md` contains v0.5.0 GA contract.
