# local-ai-relay

Local, multi-backend compatibility gateway for OpenAI-style clients and agent
harnesses.

## Read this first: what works today

This is a development repository, not a finished all-provider installer.

| Claim | Current truth |
|---|---|
| Browser adapter exists | Code and mock coverage exist for ChatGPT, Claude, Gemini, Arena, DeepSeek, Z.ai, MiniMax, Kimi, Qwen, Grok, Mistral, and Meta. |
| Browser provider is usable | It still needs current manual login and live verification on a real machine. |
| Browser provider appears in `/v1/models` | Only after the running relay has valid runtime readiness evidence. |
| Browser provider is added to Hermes | Only when it is already advertised by `/v1/models`. |
| One command installs/logs in/probes/adds every provider | **Not implemented.** Do not expect the front-page setup or `probe:all` to do this. |
| Current work | U0-01 proves the real Fedora Hermes → relay → ChatGPT path before any further provider expansion. |

The crucial missing link is persistent promotion:

```text
manual login → live probe → persist readiness in the running relay
             → /v1/models advertises model → Hermes adds it
```

Today, login/probe commands are separate processes. They can test a provider,
but their result is not yet persisted into the running relay; therefore the
remaining providers are not automatically discoverable by Hermes. This is an
unfinished feature, not a user setup mistake.

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

> **Current state:** P0-01 through P0-05 are completed and merged. The current
> assignment is U0-01: prove the real Fedora Hermes → relay → ChatGPT path before
> any further architecture or provider expansion. See [`TASK.md`](TASK.md), the
> [use-first completion plan](docs/plans/use-first-completion-plan.md), and the
> [v2 architecture reference](docs/plans/v2-master-plan.md).

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

The [use-first completion plan](docs/plans/use-first-completion-plan.md) defines
execution order, delivery gates, estimates, timeboxes, and the path through
v1.0. The [v2 master plan](docs/plans/v2-master-plan.md) remains the architecture
and threat-model reference.

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

The current critical path is U0-01, the fresh Fedora ChatGPT proof. Execute
`TASK.md`; do not choose a later item from this summary manually.

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

## Development setup — code validation only

Requirements:

- Node.js 22 or newer
- Git
- Google Chrome for current Patchright browser-provider work

```bash
git clone https://github.com/Nan0pk/local-ai-relay.git
cd local-ai-relay
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run smoke:startup
```

These commands verify the repository. They do **not** log into providers,
activate browser models, configure Hermes, or create an authenticated release.

Do not treat `curl | bash` from mutable `main` as a distribution model.
The authenticated release bootstrap is for a future published `vX.Y.Z` tag;
no stable user release is claimed here.

## Browser-provider commands — current behavior

All browser providers use separate, manually authorized persistent profiles.
These commands are useful diagnostics, not a completed onboarding system.

| Command | What it does | What it does **not** do |
|---|---|---|
| `npm run login:chatgpt` | Opens ChatGPT's dedicated profile for manual sign-in. | Does not verify a response, mark it ready, or configure Hermes. |
| `npm run login:<provider>` | Opens that provider's profile for manual sign-in. | Does not add the provider to the relay or Hermes. |
| `npm run probe:chatgpt` | Sends one harmless ChatGPT verification message. | Does not persist readiness in the service. |
| `npm run probe:<provider>` | Sends one harmless verification message to one provider. | Does not persist readiness or add it to Hermes. |
| `npm run probe:all` | Serially classifies known providers using existing profiles. | Does not log in, prompt for account choice, persist results, or add models. |
| `npm run hermes:configure` | Writes the relay provider and models already advertised by the running relay. | Cannot make an unready browser provider ready. |
| `npm run dev` / `npm start` | Starts the relay. | Does not automatically run login or probes. |

Known provider keys are `chatgpt`, `claude`, `gemini`, `arena`,
`deepseek`, `zai`, `minimax`, `kimi`, `qwen`, `grok`, `mistral`,
and `meta`. For Arena, use the generic form:

```bash
npm run browser:login -- --provider arena
node --import tsx src/cli/live-probe.ts --provider arena
```

### Current operational status

- **ChatGPT:** the only active live-use target. U0-01 must refresh its proof on
  the current Patchright build before it is called usable.
- **Claude, Gemini, Arena, DeepSeek, Z.ai, MiniMax, Kimi, Qwen, Grok, Mistral,
  Meta:** adapters and mock coverage exist, but they are not currently
  live-proven, automatically promoted, or automatically added to Hermes.
- **Official APIs, local servers, Responses API, MCP, and the browser
  extension:** planned later phases, not current product features.

Implementation, registration, a successful login, or mock E2E never establishes
live readiness. A provider must have current authenticated evidence on the
specific relay/browser/OS combination. The default `/v1/models` endpoint is
intended to show only those ready models; use
`/v1/models?include=all` and `/v1/providers/status` for diagnostics.

### What U0-01 fixes first

U0-01 proves the current ChatGPT path on Fedora, adds a repeatable live canary,
and makes its capability evidence truthful. It deliberately does not pretend to
add all providers. Once that path is stable, the plan adds a persistent
login → probe → readiness → Hermes onboarding flow and then proves Claude and
Gemini individually.

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
│   ├── plans/use-first-completion-plan.md  authoritative route through v1.0
│   ├── plans/v2-master-plan.md       architecture and threat-model reference
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
