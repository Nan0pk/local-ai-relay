# Agent Bus Protocol Reference

## Sources of truth

Use this order when files disagree:

1. Maintainer's latest explicit direction
2. `AGENTS.md`
3. Accepted architecture/security decisions
4. `docs/plans/v2-master-plan.md`
5. `docs/agent-bus/state.json`
6. Code and current tests
7. Old roadmaps, reports, comments, and agent transcripts

The master plan defines intended work. The ledger defines current scheduling
state. Code shows what exists, not what is approved or live-verified.

## Ledger design

`docs/agent-bus/state.json` is canonical. `STATUS.md` is a generated human view.
Every task carries:

- ID, title, phase, priority, status, dependencies
- risk and recommended model tier
- effort class and verification policy
- bounded read context and write scope
- acceptance commands
- claim lease, evidence, commit, and optional verification

Keep task records short. Put architecture and detailed acceptance reasoning in
the master plan; do not duplicate it in the ledger.

## State machine

```text
backlog -> ready -> claimed -> review -> done
                   |    |       |
                   +--> blocked <-+

blocked -> ready     after the root cause is resolved
claimed -> ready     after an expired lease is deliberately released
review -> claimed    when review requests changes
```

Do not mark a task done when its code is merely written. Require its acceptance
checks and evidence. High-risk tasks additionally require independent
verification of the exact commit recorded in the handoff.

## Dependencies and readiness

A task is actionable only when every `depends_on` task is `done`. The CLI may
show an eligible backlog task as ready, but agents should commit explicit state
changes rather than relying on implied status.

Never complete a task with incomplete dependencies. If the dependency is
unnecessary, change the plan and explain why instead of bypassing validation.

## Claims and leases

Claims use UTC timestamps and default to four hours. A lease prevents duplicate
paid work; it is not a lock on Git.

Before reclaiming an expired task:

1. Inspect its recorded branch and commit.
2. Look for an open pull request or remote branch.
3. Reuse valid work instead of restarting.
4. Record the takeover reason.

Renew a lease only while actively progressing. Do not keep speculative tasks
claimed.

## Branch and write-scope discipline

Use one branch per task or tightly coupled task group. Parallel agents require
disjoint `write_scope` values. If scopes overlap, serialize the tasks or agree
on an interface first.

An agent may edit shared documentation required to keep its change truthful,
but must record the overlap and avoid rewriting unrelated planning state.

Do not push directly to `main`. A handoff may create a draft pull request. The
maintainer owns the merge policy and may either merge manually or explicitly
start the guarded repository runner with `--auto` and an allowlisted reviewer.
Models never merge or enable auto-merge themselves.

## Verification policy

### Self verification

Use for low and medium risk. The builder runs focused checks and deterministic
CI. Review in the normal pull-request process remains welcome but does not
require a second paid agent session.

### Independent verification

Require for:

- authentication or authorization boundaries
- Native Messaging and local IPC framing
- extension permissions, CSP, and origin validation
- tool execution policy
- installer or update trust
- live-provider readiness claims
- security and stable-release claims

The verifier receives the task ID, exact commit, diff, acceptance criteria, and
evidence—not the builder's private reasoning or desired verdict. The verifier
must not quietly repair the change while certifying it.

### Owner gates

License, account authorization, provider-policy/legal acceptance, secret entry,
browser-store submission, and stable release are owner actions. Ordinary task
merges may be delegated only through the maintainer-started repository runner;
owner-gated tasks remain manual. Agents should prepare a recommendation and all
reversible prerequisites first.

## Review-gated automation

The runner recognizes only an allowlisted PR comment containing one of:

```text
AGENT-BUS: PASS <TASK-ID> <FULL-PR-HEAD-SHA>
AGENT-BUS: CHANGES_REQUESTED <TASK-ID> <FULL-PR-HEAD-SHA>
```

A verdict for an earlier commit, another task, or a non-allowlisted author has
no effect. PASS permits merge only after the task is `done`, required checks
pass, and the PR is no longer a draft. CHANGES_REQUESTED wakes the same builder
on the same task; it never authorizes a new task or arbitrary shell text.

## Failure packets and model escalation

Escalate model cost only after recording:

```text
Task: <ID>
Commit: <SHA or none>
Goal: <one sentence>
Failed command: <exact command>
Relevant output: <smallest useful excerpt>
Attempts: <short list>
Current hypothesis: <one sentence>
Decision needed: <specific unresolved point>
```

Give the higher-tier model this packet plus named files. Do not make it reread
the repository or reproduce successful work.

## Context economy

- Prefer `rg` and targeted line ranges.
- Exclude `dist/`, browser profiles, dependencies, screenshots, and old agent
  transcripts unless directly required.
- Reuse deterministic scripts and fixtures.
- Save durable facts in tests, decisions, or concise evidence—not chat prose.
- Do not create plan, handoff, and verdict documents for every task. The task
  record and pull request carry ordinary work; create a dedicated decision or
  evidence document only when the content has long-term value.

## Recovery

If `state.json` is invalid, do not guess at task completion. Restore the last
valid version, replay only evidence-backed mutations, run `validate`, regenerate
`STATUS.md`, and commit the repair separately.

If two branches changed the same task, preserve the record backed by the newest
valid lease or accepted pull request. Merge evidence lists without duplicating
entries. Never resolve a coordination conflict by discarding code or evidence.
