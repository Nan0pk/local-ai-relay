---
name: agent-bus
description: Coordinate local-ai-relay project work across one or more AI agents with a repository ledger, dependency-aware task selection, leases, bounded context, risk-based verification, and model-cost routing. Use when an agent needs to select, claim, implement, hand off, verify, block, or complete work from the v2 master plan, or when project status must be recovered without rereading prior agent transcripts.
---

# Agent Bus

Use the repository ledger to move one pull-request-sized task at a time while
minimizing repeated context and unnecessary model calls.

## Load the minimum context

Run:

```bash
node .agents/skills/agent-bus/scripts/bus.mjs next
node .agents/skills/agent-bus/scripts/bus.mjs show <TASK-ID>
```

Read only:

1. `AGENTS.md`
2. The selected task printed by `show`
3. Its section in `docs/plans/v2-master-plan.md`
4. Its listed `context` files

Do not begin by reading old `.agents/*` transcripts, all provider files,
generated `dist/`, or entire test logs.

## Select economical execution

Treat `model_tier` as a cost ceiling:

- `economy`: mechanical work, docs, fixtures, focused cleanup
- `standard`: normal implementation and testing
- `frontier`: ambiguous security/protocol design or failed hard diagnosis
- `owner`: a maintainer decision; prepare the recommendation and stop at the
  decision boundary

Start with the least expensive capable model. Escalate only with a compact
failure packet. Do not duplicate the same task across agents for confidence.

Default to one builder. Add an independent verifier only for `risk: high`, a
release claim, or a task that explicitly requires it. Parallelize only ready
tasks with no shared write scope.

## Claim a task

Create or switch to a task branch, then run:

```bash
node .agents/skills/agent-bus/scripts/bus.mjs claim <TASK-ID> \
  --agent <stable-name> --branch <branch>
```

Use a stable agent name that another session can recognize. A claim is a lease,
not ownership forever. Do not take a task with an unexpired lease. Reclaim an
expired task only after inspecting its branch and evidence.

Respect `write_scope`. If the task must expand, block it with the reason and
proposed split rather than silently editing unrelated areas.

## Build and prove

Implement the smallest coherent change. Run every acceptance command listed by
the task and any focused checks introduced by the change.

Record evidence as short facts with command and outcome. Link to durable logs
or artifacts when needed; never paste large logs, DOM dumps, screenshots,
prompts, cookies, or tokens into the ledger.

For normal work, hand off for merge/review:

```bash
node .agents/skills/agent-bus/scripts/bus.mjs handoff <TASK-ID> \
  --agent <stable-name> --commit <sha> \
  --evidence "npm test: pass" \
  --evidence "npm run test:e2e: 60/60 pass"
```

For a high-risk task, an independent agent must verify the exact commit before
completion:

```bash
node .agents/skills/agent-bus/scripts/bus.mjs verify <TASK-ID> \
  --agent <verifier-name> --commit <sha> --result pass \
  --evidence "<adversarial check>: pass"
```

Then complete it:

```bash
node .agents/skills/agent-bus/scripts/bus.mjs complete <TASK-ID> \
  --agent <stable-name> --commit <sha>
```

`complete` is ledger completion, not permission to merge. Only the maintainer
merges to `main`.

## Block honestly

Run:

```bash
node .agents/skills/agent-bus/scripts/bus.mjs block <TASK-ID> \
  --agent <stable-name> --reason "<root cause and missing proof>"
```

Name the blocked action, concrete risk, root cause, missing proof, and safest
next action. Continue unrelated safe work by selecting another ready task.

## Validate before handoff

Run:

```bash
node .agents/skills/agent-bus/scripts/bus.mjs validate
node --test .agents/skills/agent-bus/scripts/test_bus.mjs
```

Do not edit `docs/agent-bus/STATUS.md` manually; the CLI regenerates it from
`state.json` after every mutation.

Read [references/protocol.md](references/protocol.md) only for state-transition,
lease, concurrency, recovery, or independent-verification details.
