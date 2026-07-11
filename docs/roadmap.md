# Roadmap

Living document. Order is intentional — each milestone is independently
shippable and end-to-end testable before the next one starts.

## Milestone 1 — Mock provider (complete)

**Goal:** stand up the OpenAI-compatible surface with a deterministic mock
backend so the contract can be validated before any real provider is wired
in.

- [x] Node + TypeScript + Fastify scaffold
- [x] `GET /health`
- [x] `GET /v1/models` (OpenAI-shaped)
- [x] `POST /v1/chat/completions` (mock response, OpenAI-shaped)
- [x] Provider registry + `Provider` interface
- [x] `README`, `docs/north-star.md`, `docs/architecture.md`,
      `docs/roadmap.md`, `SECURITY.md`, `.env.example`
- [x] `npm install` + `npm run build` clean
- [x] Commit + push

**Exit criteria:** an OpenAI-compatible client pointed at the relay can list
models and get a chat completion without errors. No secrets required.

## Milestone 2 — ChatGPT Free browser transport (current)

**Goal:** prove the relay's differentiating path by routing batched work through
a normal, locally authenticated ChatGPT Free browser session.

- [x] Add a dedicated persistent Playwright profile and login command.
- [x] Implement `browser-chatgpt-free` behind the `Provider` interface.
- [x] Aggregate messages into batch mission packets.
- [x] Add sticky sessions via `X-Relay-Session` and reset forked histories.
- [x] Serialize browser work and support cancellation/timeouts.
- [x] Capture local failure screenshots without exporting credentials.
- [x] Unit-test batching, continuation, reset, response shaping, and cleanup.
- [ ] Validate selectors with an authenticated live ChatGPT Free profile.
- [ ] Add a DOM-fixture browser test after capturing a sanitized live fixture.

**Exit criteria:** a request for `browser-chatgpt-free` returns a real
completion; the same relay session continues the browser conversation; the
mock remains usable without browser setup.

## Milestone 3 — Browser reliability and structured delegation

**Goal:** make browser delegation dependable enough for an agent harness.

- [ ] Add structured batch-task and result envelopes.
- [ ] Recover after page refresh, logout, and Free usage limits.
- [ ] Add safe, redacted Playwright traces.
- [ ] Add explicit session inspection and cancellation endpoints.
- [ ] Bridge structured tool calls for harnesses that require them.

**Exit criteria:** a bounded multi-step mission either returns a structured
result or a specific recoverable error with diagnostics and a checkpoint.

## Milestone 4 — Auth & multi-tenant basics

**Goal:** let the relay sit behind a bearer token without breaking the
OpenAI surface.

- [ ] Optional bearer-token middleware (env-configured).
- [ ] Per-token rate limiting (in-memory, sliding window).
- [ ] Request ID propagation.

**Exit criteria:** relay rejects unauthenticated requests when configured,
passes authenticated ones through, and rate-limits per token.

## Milestone 5 — Additional providers and streaming

**Goal:** prove the abstraction beyond the reference browser adapter.

- [ ] Add one API or local-model provider.
- [ ] Add a second webchat adapter without changing routes.
- [ ] Extend `Provider` with a streaming method.
- [ ] Implement SSE for providers that can stream reliably.

**Exit criteria:** API, local, and two browser transports share the same route
and capability model without site-specific routing shortcuts.

## Milestone 6 — Hardening

**Goal:** make the relay safe to leave running.

- [ ] Structured logging with redaction.
- [ ] Prometheus metrics endpoint.
- [ ] Graceful backpressure under load.
- [ ] Failure-mode tests (provider down, malformed upstream response).
- [ ] Security review of the provider registry — confirm no bypass paths.

**Exit criteria:** relay runs for 24h under mixed load without leaking
credentials, dropping requests silently, or growing memory unbounded.
