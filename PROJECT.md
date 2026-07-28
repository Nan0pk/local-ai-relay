# Project: local-ai-relay

Local AI Relay is an authenticated loopback gateway that presents OpenAI-style
Chat Completions and Responses endpoints to local agent harnesses.

## Current reality

- The deterministic mock backend, API routes, model readiness gating, startup
  smoke, release-verification logic, Hermes/OpenCode config merge, and
  Patchright adapter framework have automated coverage.
- Browser adapters are registered in the full inventory, but registration and
  mock E2E do not establish live readiness. Runtime evidence controls the
  default model catalog.
- The MCP stdio server currently supports list, status, and delegate only.
- The embedded dashboard supports status inspection and a prompt smoke test.
- The extension/Native Messaging code is an experimental control bridge.
  Patchright remains the working browser inference transport.
- Package and runtime version are `0.1.0`; no stable tagged release is
  advertised.

The active assignment and acceptance commands live in [TASK.md](TASK.md).
Longer-term sequencing lives in
[docs/plans/use-first-completion-plan.md](docs/plans/use-first-completion-plan.md)
and [docs/plans/v2-master-plan.md](docs/plans/v2-master-plan.md).

## Code layout

- `src/routes/` — health, models, provider status, Responses, Chat Completions,
  OpenAPI, and dashboard routes.
- `src/providers/` — model registry, provider adapters, conversation planning,
  and tool translation.
- `src/browser/` — Patchright drivers, profiles, session queues, and mock DOM.
- `src/mcp/` — the bounded stdio MCP control/delegation surface.
- `src/extension/` and `extension/` — experimental Native Messaging bridge.
- `src/delivery/` and `scripts/` — authenticated release and validation logic.
