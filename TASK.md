# Current task: Phase U7 — Multi-Architecture CI/CD Matrix & Release Automation (v0.7.0)

**Status:** In Progress  
**Priority:** Implement multi-architecture CI/CD matrix and automated release signing  
**Estimate:** 1 engineering day  
**Deliverable:** 1 consolidated commit on `main`

## Goal

1. **GitHub Actions Multi-Arch CI Matrix (`.github/workflows/ci.yml`):** Verify dual-runner matrix (`ubuntu-latest`, `windows-latest`) for cross-platform delivery test suite.
2. **Release Attestation Automation (`.github/workflows/release.yml`):** Build, sign, and publish SPDX SBOM provenance attestations for release tarballs.

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

1. Verify `.github/workflows/ci.yml` matrix configuration.
2. Verify `.github/workflows/release.yml` release step triggers.
3. Run full 8-command baseline test suite.

## Acceptance

Deterministic:
- `npm run typecheck` passes with 0 errors.
- `npm test` passes all 289+ unit tests.
- `npm run test:delivery` passes all delivery tests.
- `node scripts/validate-release.mjs` passes cleanly.
