# Current task: U3-03 — Publish v0.4.0 release preparation & multi-provider contract

**Status:** Open  
**Priority:** reconcile v0.4.0 multi-provider expansion release contract  
**Estimate:** 0.5 engineering days  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Reconcile release documentation in `RELEASES.md` for v0.4.0 Multi-Provider Expansion release contract, verify SPDX SBOM Patchright provenance attestation, and run baseline validation.

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

1. **v0.4.0 Release Notes (`RELEASES.md`):** Update `RELEASES.md` with v0.4.0 release notes documenting full 11-provider browser adapter pool (ChatGPT, Claude, Gemini, DeepSeek, Arena, Minimax, Qwen, Z.ai, Grok, Kimi, Mistral, Meta).
2. **Release Asset Validation:** Ensure `node scripts/validate-release.mjs` executes cleanly.

## Acceptance

Deterministic:
- Full 8-command baseline passes.
- `RELEASES.md` contains v0.4.0 contract.
