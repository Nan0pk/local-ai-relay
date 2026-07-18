# local-ai-relay Agent Guide

## Mission

Build a local, multi-backend AI compatibility gateway. Official APIs and local
model servers are stable backends. Visible browser adapters are experimental,
user-authorized transports. Do not design around bypassing CAPTCHAs, access
controls, rate limits, or provider safeguards.

## Start here

For project work, read only what the task needs:

1. `docs/agent-bus/STATUS.md`
2. The selected task from `docs/agent-bus/state.json`
3. That task's section in `docs/plans/v2-master-plan.md`
4. The files named by the task's `context` field

Use the bus CLI instead of manually editing generated status:

```bash
node .agents/skills/agent-bus/scripts/bus.mjs next
node .agents/skills/agent-bus/scripts/bus.mjs show <TASK-ID>
```

Read `.agents/skills/agent-bus/SKILL.md` before claiming or handing off work.

## Operating rules

- Default to one agent per task. Add another only when work is independent or
  the task requires independent verification.
- Work on a task branch. Never push directly to `main`, merge a pull request,
  or enable auto-merge. The only exception is the non-model repository runner
  when the maintainer explicitly starts `npm run agent:run -- --auto` with an
  allowlisted reviewer; its exact-SHA, CI, ledger, and owner-gate checks remain
  mandatory.
- Respect each task's `write_scope`. Split unrelated discoveries into a new
  task or a concise follow-up; do not expand the current change silently.
- Treat `model_tier` as a cost ceiling, not a status symbol. Start with the
  least expensive capable model and escalate only with recorded evidence.
- Read targeted files and diffs. Do not ingest the whole repository, old agent
  transcripts, generated `dist/`, or full logs unless the task requires it.
- Run the task's acceptance checks. Record commands and outcomes, not pasted
  logs. Never invent test, browser, account, or provider evidence.
- Keep prompts, responses, cookies, screenshots, profiles, and tokens out of
  Git. Diagnostics must be opt-in and redacted.
- A provider is not ready merely because its adapter compiles. Advertising it
  requires the capability and live-evidence rules in the master plan.
- Browser-derived tool calls are untrusted proposals. Do not auto-execute an
  externally visible or destructive action without explicit policy approval.

## Quality proportional to risk

| Risk | Required proof |
|---|---|
| Low | Builder checks and focused tests |
| Medium | Builder checks plus full deterministic CI |
| High | Independent review of the exact commit plus adversarial tests |
| Owner | Human decision or action; agents prepare the recommendation |

High risk includes authentication boundaries, native-host installation,
extension permissions, browser-to-daemon protocol changes, tool execution,
release claims, and live-provider enablement.

## Human-effort rule

Investigate before asking. Ask only for a true owner decision, using:

```text
Decision needed: <decision>
Recommended default: <recommendation>
Why: <brief reason>
Risk if wrong: <brief risk>
Next agent action: <what follows>
```

License choice, provider-account authorization, legal approval, secret entry,
browser-store publication, and stable-release approval remain human actions.
Ordinary task merges may be delegated only through the maintainer-started,
review-gated repository runner described above. Everything else should advance
as far as safely possible without making the human coordinate agents manually.
