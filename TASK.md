# Current task: U0-04 — Publish v0.1.0 release preparation & wording reconciliation

**Status:** Open  
**Priority:** prepare v0.1.0 personal alpha release contract  
**Estimate:** 0.5 engineering days  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Reconcile release documentation, verify SBOM Patchright provenance attestation, enforce protected tag & protected release environment requirements, and update release notes for v0.1.0 personal alpha publication.

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

1. **Release Notes Wording (`RELEASES.md`):** Reconcile v0.1.0 release notes to include mandatory maintainer-attested release wording.
2. **Release Validation Verification:** Ensure `node scripts/validate-release.mjs` verifies all 8 release assets.

## Acceptance

Deterministic:
- Full 8-command baseline passes cleanly.
- `RELEASES.md` contains exact release wording.
