# BRIEFING — 2026-07-16T00:15:35+05:00

## Mission
Implement Shared Browser Profile & Google SSO click automation (R2).

## 🔒 My Identity
- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /home/victus/agy/.agents/sub_orch_m2_sso
- Original parent: parent
- Original parent conversation ID: 30c00763-f3a8-487f-b387-fa3564c1e7e2

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /home/victus/agy/.agents/sub_orch_m2_sso/SCOPE.md
1. **Decompose**: Decompose the milestone into single-pass implementable tasks (Explorer -> Worker -> Reviewer).
2. **Dispatch & Execute**: Direct (iteration loop). Run the Explorer -> Worker -> Reviewer cycle.
3. **On failure**:
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Self-succeed at spawn count >= 16.
- **Work items**:
  1. Initialize SCOPE.md [pending]
  2. Implement BrowserContextManager [pending]
  3. Update BaseBrowserDriver [pending]
  4. Implement Google SSO click automation hook [pending]
  5. Verify build and test suite [pending]
- **Current phase**: 1
- **Current focus**: Initialize SCOPE.md

## 🔒 Key Constraints
- Apply global directives: /caveman (concise communication) and /ponytail (simplest/laziest solution).
- Never reuse a subagent after it has delivered its handoff.
- Orchestrator must not write code or run tests/builds directly. Must spawn workers/explorers.

## Current Parent
- Conversation ID: 30c00763-f3a8-487f-b387-fa3564c1e7e2
- Updated: not yet

## Key Decisions Made
- None

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|

## Succession Status
- Succession required: no
- Spawn count: 0 / 16
- Pending subagents: none
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: task-9
- Safety timer: none

## Artifact Index
- /home/victus/agy/.agents/sub_orch_m2_sso/progress.md - Liveness heartbeat and progress tracking
- /home/victus/agy/.agents/sub_orch_m2_sso/SCOPE.md - Milestone scope and interface contracts
- /home/victus/agy/.agents/sub_orch_m2_sso/handoff.md - Final handoff report
