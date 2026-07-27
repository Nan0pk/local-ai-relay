# Current task: U0-03 — Cross-platform dogfood & deterministic fault-injection harness

**Status:** Open  
**Priority:** validate classification resilience before v0.1.0 publication  
**Estimate:** 0.5–1 engineering days  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Build the deterministic local fault-injection harness for challenge/quota/network-cut DOM states and generate the aggregate sanitized dogfood evidence report.

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

1. **Fault Injection Harness (`src/cli/fault-injection.ts`):** Create local fixture server/harness simulating challenge (Cloudflare turnstile), quota (rate limit UI), logged-out, and network-cut DOM states.
2. **Classification Verification:** Verify typed `BrowserFailure` taxonomy correctly handles each injected fault path without unhandled rejections or silent fallbacks.
3. **Sanitized Dogfood Report (`docs/e2e/dogfood-report.md`):** Commit aggregate sanitized evidence report tracking classification correctness ($\ge 95\%$) and user availability metrics.

## Acceptance

Deterministic:
- `npm test` passes all fault-injection harness test cases.
- Full 8-command baseline passes cleanly.
