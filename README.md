# local-ai-relay

Local, multi-backend compatibility gateway for OpenAI-style clients and agent
harnesses.

## Continue building v2

From a clone with dependencies installed, give any supported coding agent this
single repository command:

```bash
npm run agent:run
```

It validates the ledger, resumes the only active task or selects the next
dependency-ready task, chooses an economical model tier, runs one Antigravity
or Codex builder turn, and stops at review. Antigravity (`agy`) is preferred
when both CLIs are installed; use `--builder codex` to override it.

To keep watching and permit automatic squash-merge after an independent review:

```bash
npm run agent:run -- --auto --reviewer YOUR_REVIEWER_GITHUB_LOGIN
```

`--auto` is deliberately fail-closed. It accepts a verdict only from an
allowlisted GitHub login and only when the comment names the task and the exact
40-character PR head SHA. The task must be complete in the ledger, the PR must
be out of draft, and required checks must pass. Owner-gated tasks and release
claims stop for a human. After GitHub merges an ordinary task, the runner
fast-forwards the default branch and continues with the next ready task. The
builder itself cannot merge or enable auto-merge.

The reviewer posts one machine-readable line on the PR:

```text
AGENT-BUS: PASS P1-02 1234567890abcdef1234567890abcdef12345678
AGENT-BUS: CHANGES_REQUESTED P1-02 1234567890abcdef1234567890abcdef12345678
```

Auto mode additionally requires an authenticated GitHub CLI (`gh auth login`).
Use `--dry-run` to inspect the selected task and prompt without invoking a
model. See the [agent-bus skill](.agents/skills/agent-bus/SKILL.md) for recovery
and review rules.

The project is evolving from a Patchright-only browser relay into **v2 Hybrid**:

- official API and local-model servers as stable backends;
- a visible Manifest V3 browser extension as the preferred experimental
  webchat transport;
- Patchright retained as a compatibility and recovery transport;
- OpenAI Chat Completions and Responses-style APIs for model traffic;
- MCP as an optional control and delegation plane.

> **Current state:** v2 is planned and Phase 0 is in progress. On current
> `main` (`1e6449b`), typecheck and all 240 unit tests pass. With an isolated,
> writable test home, the mock-backed E2E suite is 59/60: the remaining failure
> is a stale assertion that expects internal tool instructions to leak into the
> returned assistant text. P0-01 and P0-02 code has merged, but their ledger
> handoff/verification state still needs reconciliation before autonomous work
> should advance. The runner fails closed on that inconsistency. Follow the
> [master plan](docs/plans/v2-master-plan.md) and live
> [agent-bus status](docs/agent-bus/STATUS.md), not old milestone prose.

## What v2 is trying to achieve

| Backend | Intended support level | Connection |
|---|---|---|
| Official API | Stable | Explicit configured upstream |
| Local model server | Stable when configured | OpenAI/Anthropic-compatible adapter |
| Visible browser tab | Experimental and user-authorized | MV3 extension + Native Messaging |
| Managed browser | Experimental fallback | Existing Patchright transport |

The extension reuses an explicitly approved visible browser session, but the
relay does not bypass login, CAPTCHA, rate limits, access controls, or provider
safeguards. Login and account selection remain manual.

## Architecture

```text
IDE / harness ── Chat Completions + Responses ─┐
MCP host ─────── MCP adapter process ──────────┤
                                               ▼
                                        local daemon
                              capabilities + scheduler + state
                           /                |                 \
                 MV3 extension          Patchright       API/local server
                 Native Messaging        fallback          adapter
                         |
                  user-approved tab
```

Important contracts:

- Native Messaging and MCP use separate process modes because both frame
  `stdio` differently.
- Bridge frames are versioned, sequenced, hashed, quota-bound, and multipart
  from day one. The target frame size is at most 256 KiB including JSON
  overhead, safely below the browser boundary.
- The daemon is the request source of truth. A restarted service worker resumes
  observation and never blindly resubmits a prompt.
- Streaming is reconciled from volatile DOM snapshots using append, replace,
  snapshot, and final events. It is reported as UI-observed streaming, not
  upstream token streaming.
- Browser-derived tool calls are untrusted proposals. Structural DOM boundaries
  may help parsing but do not authorize execution.
- Remote executable extension/WASM logic, silent model fallback, automatic
  account choice, embedded inference, and default semantic caching are outside
  the v2 design.

The complete decisions, task graph, gates, and deferred work are in
[docs/plans/v2-master-plan.md](docs/plans/v2-master-plan.md).

## One-prompt project execution

Repository-aware coding agents should load `AGENTS.md` automatically. For any
capable model, this single prompt is enough to select and execute the next safe
unit of work:

```text
Continue local-ai-relay v2. Follow AGENTS.md and the repo-local agent-bus skill.
Select the highest-priority dependency-ready task, claim it, read only its bounded
context, implement the smallest complete change, run its acceptance checks,
update the bus, and prepare a draft pull request. Use the least expensive capable
model tier and escalate only with a compact failure packet. Do not ask me for
implementation choices the repository can resolve; stop only for an owner-only
decision or a concrete safety blocker. Never merge.
```

The executable form above is preferred. For systems that cannot launch a
repository command but can accept pasted text:

```bash
npm run agent:prompt
```

That prints a self-contained prompt for the current highest-priority ready task.

Useful project-agent commands:

```bash
npm run agent:run        # execute one economical builder turn and stop at review
npm run agent:next       # show the next task, context, scope, and checks
npm run agent:prompt     # emit a copy/paste task prompt
npm run agent:status     # render current human-readable status
npm run agent:check      # validate ledger, generated status, and bus behavior
```

The improved agent bus is deliberately economical:

- one builder by default, not an automatic agent swarm;
- 33 dependency-aware, pull-request-sized tasks;
- model tiers are cost ceilings: economy, standard, or frontier;
- independent verification only for security, release, installer, tool, native
  bridge, or live-provider claims;
- task-specific context and write scopes prevent whole-repository rereads;
- leases prevent duplicate paid work;
- a single task record replaces routine plan/handoff/verdict document triplets;
- status is generated deterministically from the machine-readable ledger.

See [AGENTS.md](AGENTS.md), the
[agent-bus skill](.agents/skills/agent-bus/SKILL.md), and
[state.json](docs/agent-bus/state.json).

## Delivery phases

| Phase | Outcome |
|---|---|
| 0 — Truth and hazards | Green E2E, safe tool proposals, truthful discovery, user-controlled login, authenticated loopback |
| 1 — Transport foundation | BrowserTransport, bridge protocol, chunking, durable generations, reconciled streaming, cancellation |
| 2 — Extension proof | WXT MV3 extension, Native Messaging, worker rebind, mock E2E, one authorized live adapter |
| 3 — Gateway interfaces | Explicit backend selection, Responses API, official/local adapters, MCP control plane, observability |
| 4 — Release | Provider conformance, individual rollout, signed artifacts, 24-hour soak, scoped beta |
| 5 — Measure first | Benchmark TypeScript; consider Rust only if written thresholds fail |

The current critical path is Phase 0. Run `npm run agent:next` for the exact
highest-priority task rather than choosing from this summary manually.

## Current developer setup

This is a development repository and does not yet have the signed, versioned v2
installer described in the plan.

Requirements:

- Node.js 22 or newer
- Git
- Google Chrome only for current Patchright browser-provider work

```bash
git clone https://github.com/Nan0pk/local-ai-relay.git
cd local-ai-relay
npm ci
npm run typecheck
npm test
npm run build
npm run smoke:startup
```

Do not treat `curl | bash` from mutable `main` as the final distribution model.
Versioned artifacts, signature verification, rollback, and native-host setup are
tracked in Phase 0 and Phase 4.

## Current v1 operation

The existing implementation exposes a Fastify API and uses Patchright browser
drivers. These commands remain development tools while v2 is built:

```bash
npm run browser:login             # visible login flow
npm run login:<provider>          # provider-specific login
npm run probe:<provider>          # explicit live probe
npm run probe:all                 # classify configured providers
npm run dev                       # development server
npm start                         # built server
```

Known browser-provider keys are `chatgpt`, `claude`, `gemini`, `deepseek`,
`zai`, `minimax`, `kimi`, `qwen`, `grok`, `mistral`, and `meta`.

Implementation or registration does not establish live readiness. Consult the
per-provider evidence under `docs/e2e/`; Phase P0-02 will make runtime model
discovery enforce that rule.

## Current API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `GET` | `/v1/models` | Current registered models; truthfulness hardening is pending |
| `POST` | `/v1/chat/completions` | OpenAI-compatible completion and buffered compatibility SSE |

Example against the deterministic mock:

```bash
curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'X-Relay-Session: demo' \
  -d '{
    "model":"mock-gpt-4o-mini",
    "messages":[{"role":"user","content":"Return three improvements."}]
  }'
```

Loopback bearer authentication is a Phase P0-03 requirement. Do not expose the
current development server on an untrusted interface.

## Verification

```bash
npm run agent:check
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run smoke:startup
```

Test categories have different meanings:

- unit and deterministic integration tests prove local code behavior;
- mock E2E proves the local pipeline without provider credentials;
- live E2E proves one provider/environment at a recorded date and commit;
- soak and chaos evidence is required for release reliability.

Never convert one category into another in documentation.

## Repository map

```text
local-ai-relay/
├── AGENTS.md                         repository instructions for agents
├── .agents/skills/agent-bus/         economical coordination skill and CLI
├── bootstrap.sh / bootstrap.ps1       current development bootstrap entry points
├── verify-all.sh / verify-all.cmd     current provider verification helpers
├── docs/
│   ├── agent-bus/                    machine state and generated status
│   ├── plans/v2-master-plan.md       full architecture and execution graph
│   ├── adr/                          accepted architectural decisions
│   ├── e2e/                          sanitized live-provider evidence
│   ├── architecture.md               current implementation architecture
│   └── providers.md                  provider contracts and evidence policy
├── src/
│   ├── browser/                      current Patchright drivers and lifecycle,
│   │                                 including the Meta AI adapter
│   ├── providers/                    adapters, planner, registry, tool bridge
│   ├── routes/                       health, models, chat completions
│   ├── cli/                          login, probe, service, and setup commands
│   └── types/                        current OpenAI-compatible types
├── tests/e2e/                         deterministic opaque-box E2E suite
├── .github/workflows/ci.yml           Linux and Windows deterministic CI
├── SECURITY.md
└── package.json
```

## Safety and product boundaries

- Consumer-web adapters are experimental local UI automation, not official
  provider APIs.
- Use them only with explicit user authorization and after reviewing applicable
  provider policies.
- The relay does not request or commit passwords, cookies, browser profiles,
  session tokens, API keys, prompts, or responses.
- Diagnostics must be explicit, local, redacted, size-bounded, and expiring.
- A challenge page pauses automation for manual handling; it is never bypassed.
- Only the maintainer approves provider accounts, license, browser-store
  publication, release wording, merges, and stable-release claims.

See [SECURITY.md](SECURITY.md) for current security reporting and the master
plan for the v2 threat model and release gates.

## License

No license has been selected. Treat the repository as source-available, not
open source, until the maintainer chooses and adds a `LICENSE` file. This is an
explicit owner gate in task P0-04.
