# Current task: U1-03 — Web extension sidecar (MV3)

**Status:** Open  
**Priority:** build Manifest V3 web extension sidecar for DOM interaction  
**Estimate:** 1 engineering day  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Build Manifest V3 web extension sidecar under `extension/` providing native browser tab connection, WebSocket/HTTP loopback to relay, and declarative permissions (`activeTab`, `storage`).

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

1. **MV3 Manifest (`extension/manifest.json`):** Define Manifest V3 configuration with minimum permissions (`activeTab`, `storage`) and background service worker.
2. **Sidecar Bridge (`extension/background.js`):** Implement WebSocket loopback client connecting to local relay server.
3. **Content Script (`extension/content.js`):** Implement isolated DOM event listener and prompt injector.

## Acceptance

Deterministic:
- `extension/manifest.json` parses as valid MV3 manifest.
- Full 8-command baseline passes.
