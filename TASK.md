# Current task: U1-01 — Complete evidence lifecycle & provider control plane

**Status:** Open  
**Priority:** complete evidence expiration matrix, provider CLI verbs, and security gates  
**Estimate:** 1 engineering day  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Implement the evidence lifecycle invalidation matrix, CLI control verbs (`status`, `reprobe`, `disable`, `enable`, `clear-evidence`), global provider kill switch, and CI secret scanning/audit gates.

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

1. **Evidence Expiration & Invalidation Matrix:** Handle automatic invalidation on adapter, model, browser, transport, or relay configuration changes.
2. **Provider Control CLI Verbs:** Implement `status`, `reprobe`, `disable`, `enable`, and `clear-evidence` CLI subcommands in `src/cli/provider-control.ts`.
3. **Global Kill Switch:** Add global browser-provider kill switch (`RELAY_BROWSER_KILL_SWITCH=1`) and stable `provider_not_ready` error taxonomy.
4. **CI Security Baseline:** Integrate gitleaks secret scanning and npm audit gate in `.github/workflows/ci.yml`.

## Acceptance

Deterministic:
- Full 8-command baseline passes.
- Unit tests verify CLI control verbs, kill switch, and invalidation rules.
