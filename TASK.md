# Current task: U0-02 — Windows ChatGPT proof & non-admin persistence foundation

**Status:** Open  
**Priority:** unblock Windows background service & non-admin persistence  
**Estimate:** 0.5–1 engineering days  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Implement and verify non-admin Windows process persistence via Task Scheduler (`ONLOGON` trigger, "run only when user is logged on"), stale PID validation (PID + process creation timestamp), occupied port selection, relay configuration backup/merge, and zero-duplicate restart semantics.

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

1. **Task Scheduler Registration:** Implement user-level Task Scheduler registration (`schtasks /create /tn local-ai-relay /tr ... /sc ONLOGON`) without requiring Administrator elevation.
2. **Stale PID Validation:** Update PID file management (`src/cli/install-service.ts`, `src/cli/start-windows-service.ts`) to store `{ pid, startTime }`. Validate live process start time on read to prevent PID reuse bugs.
3. **Port & Configuration Handling:** Verify occupied port selection and Hermes/OpenCode configuration backup (`*.bak-local-ai-relay`) and non-destructive merge.
4. **Zero-Duplicate Restart Verification:** Ensure SQLite ledger resumes observation for generation restarts without prompt resubmission.

## Acceptance

Deterministic:
- Full baseline passes cleanly on Linux and Windows CI.
- Unit tests verify PID + start-time validation, Task Scheduler command parsing, and config backup.
