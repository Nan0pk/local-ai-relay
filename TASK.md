# Current task: U0-01 — Fresh Fedora ChatGPT proof

**Status:** Open  
**Priority:** unblock daily use before any further architecture or providers  
**Estimate:** 0.5–1.5 focused engineering days  
**Deliverable:** one draft pull request against `main`; do not merge

## Goal

Prove—or quickly falsify—the current real path:

```text
Hermes -> local-ai-relay -> current Patchright ChatGPT adapter -> Hermes
```

Use the current Fedora/Node 22/stable Chrome environment and an explicitly
authorized ChatGPT account. Do not add providers, start the extension, or work
on unrelated roadmap tasks.

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

Confirm the exact branch/commit and check GitHub for an existing U0-01 PR before
starting. Stop immediately if the task is already complete elsewhere.

## Required work

1. Reproduce the documented development setup on Fedora with Node 22 and current
   stable Chrome/Patchright. Preserve existing user configuration, diagnostics,
   and dedicated browser profile.
2. Run `npm run login:chatgpt` when authentication is required. Login, account
   choice, 2FA, and challenge handling remain manual; never bypass them.
3. Pass `npm run probe:chatgpt` on the exact commit and record sanitized live
   evidence containing environment versions, timestamp, test ID, timings, and
   failure class. Do not store prompt/response text, tokens, cookies, profiles,
   or unredacted screenshots.
4. Prove Hermes through the relay for:
   - a normal single-turn response;
   - compatibility streaming;
   - a multi-turn continuation;
   - a long prompt that exercises native insertion;
   - compact tool schemas;
   - one safe read-only tool proposal and round trip.
5. Restart the relay service and browser context, then prove the next mission
   succeeds without duplicate prompt submission, lost provider identity, or
   duplicate tool execution.
6. Add or repair the smallest repeatable ChatGPT canary needed to run five
   consecutive sanitized missions. Reuse existing probe, driver, planner,
   startup, and Hermes code instead of creating a second harness.
7. Make runtime capability evidence truthful: ChatGPT must enter default model
   discovery only after the current live proof, and logged-out, challenge,
   quota, timeout, layout-change, and stale-evidence states must remain
   actionable and non-ready as appropriate.
8. Reconcile ChatGPT live-evidence documentation. Explicitly distinguish mock
   E2E, this live Fedora result, and the still-unproven Windows path.

## Fail-fast rule

For one external failure class, make at most three bounded attempts after
capturing diagnostics. If login, policy, CAPTCHA, provider outage, or an
unrecoverable layout blocks progress, stop with exact evidence and the smallest
recommended next action. Do not redesign the architecture or weaken readiness
rules to manufacture a pass.

## Parallel execution

Live login, browser probes, Hermes missions, and capability promotion are
serialized and coordinator-owned. `$parallel-task` may use at most two workers
only after a concrete failure is reproduced:

- **Driver worker:** ChatGPT-specific driver/runtime fixtures and tests under
  `src/browser/`.
- **Harness/evidence worker:** repeatable canary tooling and sanitized evidence
  documentation under `scripts/`, `src/cli/`, and `docs/e2e/`.

Shared provider registry, capability tracker, package files, README, TASK.md,
integration, remote branch, and draft PR remain coordinator-owned. Workers must
not run simultaneous live missions against the same browser profile.

## Initial write scope

- ChatGPT-specific files under `src/browser/` and `src/providers/`
- capability/evidence code and tests when required by reproduced behavior
- relevant CLI/canary code under `src/cli/` and `scripts/`
- deterministic fixtures/tests
- `docs/e2e/chatgpt.md`, `docs/antigravity-e2e-report.md`, and README truth
- package scripts only when required for the repeatable canary

Expand scope only with repository evidence and explain it in the PR.

## Acceptance

Deterministic:

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

Live:

- fresh `probe:chatgpt` pass on the final commit;
- Hermes single-turn, streaming, continuation, long-prompt, compact-tool, and
  safe read-only tool round-trip cases pass;
- five consecutive canary missions pass after one cold relay/browser restart;
- `/v1/models` and provider diagnostics reflect the live evidence truthfully;
- GitHub CI passes on Ubuntu and Windows without credentials.

## Required handoff

Report:

- remote branch, full commit SHA, and draft PR URL;
- exact deterministic and live results;
- Fedora, Node, Chrome/Patchright, Hermes, provider/model, timestamp, and evidence
  path;
- mission count, timings, failure classes, recovery actions, and remaining
  blockers without prompt/response content;
- security/privacy assumptions and every manual owner action;
- whether U0-02 Windows proof is unblocked.

Do not merge. Do not claim Windows or another provider from this Fedora result.
