# local-ai-relay

Local, multi-backend compatibility gateway for OpenAI-style clients and agent
harnesses.

## For coding agents

Read [`AGENTS.md`](AGENTS.md), then execute the single current assignment in
[`TASK.md`](TASK.md). `TASK.md` states the exact scope, acceptance commands, and
required pull-request handoff. The repository has no orchestration service or
special command; an externally installed Codex CLI `$parallel-task` skill may
coordinate only the disjoint workstreams explicitly allowed by those files.

The project is evolving from a Patchright-only browser relay into **v2 Hybrid**:

- official API and local-model servers as stable backends;
- a visible Manifest V3 browser extension as the preferred experimental
  webchat transport;
- Patchright retained as a compatibility and recovery transport;
- OpenAI Chat Completions and Responses-style APIs for model traffic;
- MCP as an optional control and delegation plane.

> **Current state:** v2 is planned and Phase 0 is in progress. P0-01 through
> P0-04 are completed and merged; P0-05 (secure bootstrap and dependency
> delivery) is the current assignment. See [`TASK.md`](TASK.md) and the
> [master plan](docs/plans/v2-master-plan.md).

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

## Project execution

Every agent gets the same contract regardless of model, CLI, or subscription:

1. `AGENTS.md` defines repository behavior.
2. `TASK.md` defines the one current task and deliverable.
3. The task is complete only when its checks run and its remote draft PR exists.

Codex CLI may use `$parallel-task` when installed, but one coordinator still
owns integration and the single PR; workers use only the disjoint write scopes
in `TASK.md`.

## Delivery phases

| Phase | Outcome |
|---|---|
| 0 — Truth and hazards | Green E2E, safe tool proposals, truthful discovery, user-controlled login, authenticated loopback |
| 1 — Transport foundation | BrowserTransport, bridge protocol, chunking, durable generations, reconciled streaming, cancellation |
| 2 — Extension proof | WXT MV3 extension, Native Messaging, worker rebind, mock E2E, one authorized live adapter |
| 3 — Gateway interfaces | Explicit backend selection, Responses API, official/local adapters, MCP control plane, observability |
| 4 — Release | Provider conformance, individual rollout, signed artifacts, 24-hour soak, scoped beta |
| 5 — Measure first | Benchmark TypeScript; consider Rust only if written thresholds fail |

The current critical path is P0-05. Execute `TASK.md`; do not choose a later
item from this summary manually.

## Authenticated release delivery

P0-05 defines an exact-version, fail-closed delivery contract. It does not mean
that a production-ready release has been published. Never execute bootstrap
from mutable `main`.

For a published release, download `bootstrap.sh` or `bootstrap.ps1` from its
exact `vX.Y.Z` tag with GitHub CLI, verify the bootstrap's GitHub artifact
attestation, and only then execute it with the same explicit version. Bootstrap
authenticates the release manifest, verifier, and platform archive before any
payload code runs. Updates are transactional and rollback selects the prior
already-verified local version.

See [the authenticated release policy](docs/release-policy.md) for exact Linux
and Windows install, verify, update, rollback, recovery, platform support, and
trust assumptions.

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

Do not treat `curl | bash` from mutable `main` as a distribution model.
Development checkout commands do not authenticate a release.

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

Known browser-provider keys are `chatgpt`, `claude`, `gemini`, `arena`, `deepseek`,
`zai`, `minimax`, `kimi`, `qwen`, `grok`, `mistral`, and `meta`.

Implementation or registration does not establish live readiness. Consult the
per-provider evidence under `docs/e2e/`; Phase P0-02 will make runtime model
discovery enforce that rule.

## Current API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `GET` | `/v1/models` | Models currently usable according to runtime capability evidence |
| `POST` | `/v1/chat/completions` | OpenAI-compatible completion and buffered compatibility SSE |

Example against the deterministic mock:

```bash
# Retrieve the loopback token
TOKEN=$(cat ~/.local-ai-relay/token)

# Make the request with the Authorization header
curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'X-Relay-Session: demo' \
  -d '{
    "model":"mock-gpt-4o-mini",
    "messages":[{"role":"user","content":"Return three improvements."}]
  }'
```

## Security & Configuration

The gateway implements security controls by default:

- **Loopback Bearer Authentication**: A high-entropy bearer token is generated and persisted at `~/.local-ai-relay/token` with `0o600` permissions. All API endpoints except `/health` require this token in the `Authorization: Bearer <token>` header. You can override it by setting the `RELAY_API_TOKEN` environment variable.
- **Loopback Binding Safety**: The server defaults to binding to `127.0.0.1`. Binding to a non-loopback host (e.g., `0.0.0.0`) is refused unless explicitly authorized via `RELAY_UNSAFE_BIND_ACK=1` and custom `RELAY_API_TOKEN` environment variables.
- **Strict CORS Protection**: Cross-origin requests are blocked unless the `Origin` header matches a loopback host or starts with `chrome-extension://`.

## Verification

```bash
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
├── TASK.md                           one current task and required deliverable
├── bootstrap.sh / bootstrap.ps1       current development bootstrap entry points
├── verify-all.sh / verify-all.cmd     current provider verification helpers
├── docs/
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

- All browser-based providers are experimental fallback adapters (local UI automation), not official provider APIs.
- The streaming mode for these experimental browser-based providers is UI-observed streaming. Since browser interfaces do not naturally expose token-by-token API streams, the relay implements UI-observed streaming by polling or observing DOM mutations in the browser's assistant message container, tracking the growth of the text content dynamically, extracting newly appended text slices, and emitting them as compatibility Server-Sent Events (SSE) chunks to the client.
- Use them only with explicit user authorization and after reviewing applicable provider policies.
- The relay does not request or commit passwords, cookies, browser profiles,
  session tokens, API keys, prompts, or responses.
- Diagnostics must be explicit, local, redacted, size-bounded, and expiring.
- A challenge page pauses automation for manual handling; it is never bypassed.
- Only the maintainer approves provider accounts, license, browser-store
  publication, release wording, merges, and stable-release claims.

See [SECURITY.md](SECURITY.md) for current security reporting and the master
plan for the v2 threat model and release gates.

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](LICENSE) file for the full text.
