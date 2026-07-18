# Current task: P0-04 — Reconcile project truth and owner decisions

**Status:** Open  
**Deliverable:** One draft pull request against `main`; do not merge.

## Goal

Reconcile documentation, roadmaps, and reports to reflect the completed state of Phase 0 tasks (P0-01, P0-02, P0-03), explicitly label browser providers as experimental and document their streaming mode, record the provider-policy review gate, and present a concise license comparison for the maintainer's selection.

## Required work

1. Reconcile `README.md`, `PROJECT.md`, `docs/roadmap.md`, `docs/providers.md`, and `docs/antigravity-e2e-report.md` to reflect the completed Phase 0 status and updated model/provider lists.
2. Label browser-based providers clearly as `experimental` and state the actual streaming mode (UI-observed DOM polling emitted as compatibility SSE chunks).
3. Create `docs/adr/0002-provider-policy-gate.md` to record the provider-policy review gate.
4. Prepare and output a concise license comparison (MIT, Apache-2.0, GPL-3.0) and ask the maintainer to select the project license.

## Initial write scope

- `TASK.md`
- `README.md`
- `PROJECT.md`
- `docs/roadmap.md`
- `docs/providers.md`
- `docs/antigravity-e2e-report.md`
- `docs/adr/0002-provider-policy-gate.md`

## Acceptance checks

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run smoke:startup
```

## Required handoff

Report the remote branch, full commit SHA, draft PR URL, changed files, exact check results, security assumptions, and license selection query. Do not merge.
