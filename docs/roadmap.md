# Roadmap

This file records remaining outcomes, not completed work inferred from adapter
registration. [TASK.md](../TASK.md) is the current assignment.

## Verified deterministic foundation

- [x] Authenticated loopback health, models, provider-status, Responses, and
  Chat Completions routes.
- [x] Deterministic mock provider, startup smoke, unit, mock E2E, and delivery
  suites.
- [x] Readiness-gated model discovery with persisted, expiring live evidence.
- [x] Hermes/OpenCode configuration merge with backups and explicit opt-in.
- [x] OpenAPI 3.1 generator, committed document, and authenticated route.
- [x] MCP stdio list/status/delegate tools.
- [x] Minimal status and prompt dashboard.

## Live provider work

Every registered browser adapter still needs a current, sanitized,
authenticated live probe on each supported operating-system path before it can
be called ready. Mock E2E is necessary but insufficient.

- [ ] ChatGPT fresh Fedora and Windows proof.
- [ ] Claude, Gemini, DeepSeek, Z.ai, MiniMax, Kimi, Qwen, Grok, Mistral, Meta,
  and Arena bounded live proofs.
- [ ] Provider-specific logout, challenge, quota, cancellation, and session
  recovery evidence.
- [ ] Soak testing with measured duration and sanitized results.

## Incomplete integrations

- [ ] Extension inference vertical slice: API → daemon → native host →
  extension → mock page → response.
- [ ] Packaged Windows Native Messaging executable and reversible installer.
- [ ] Native Messaging restart, chunking, replay, origin, and security review.
- [ ] MCP cancellation, login/probe operations, diagnostics, and optional
  Streamable HTTP.
- [ ] Official OpenAI-compatible and local Ollama/LM Studio upstream adapters.
- [ ] Metrics, traces, and request observability that never store prompt or
  response content by default.
- [ ] Signed release tag and artifacts after both CI operating systems pass.
