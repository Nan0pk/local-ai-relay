# Roadmap

Living document. Order is intentional — each milestone is independently
shippable and end-to-end testable before the next one starts.

## Milestone 1 — Mock provider (current)

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

## Milestone 2 — First real API provider

**Goal:** route at least one real LLM provider behind the same surface.

- [ ] Pick one provider (OpenAI or Anthropic).
- [ ] Read credentials from env only — no files, no commit.
- [ ] Implement the `Provider` interface for it.
- [ ] Register it alongside the mock provider.
- [ ] Add request/response logging (redacted).
- [ ] Add a `npm test` smoke test that hits the mock provider in-process.

**Exit criteria:** a request for `gpt-4o-mini` (or equivalent) returns a
real completion; a request for `mock-gpt-4o-mini` still returns the mock.

## Milestone 3 — Streaming

**Goal:** support `stream: true` end-to-end.

- [ ] Extend `Provider` with a streaming method.
- [ ] Implement SSE response in `routes/chat.ts`.
- [ ] Mock provider emits a deterministic chunked stream.
- [ ] Real provider streams through the same path.

**Exit criteria:** a streaming client receives token-by-token SSE events
for both mock and real providers.

## Milestone 4 — Auth & multi-tenant basics

**Goal:** let the relay sit behind a bearer token without breaking the
OpenAI surface.

- [ ] Optional bearer-token middleware (env-configured).
- [ ] Per-token rate limiting (in-memory, sliding window).
- [ ] Request ID propagation.

**Exit criteria:** relay rejects unauthenticated requests when configured,
passes authenticated ones through, and rate-limits per token.

## Milestone 5 — Browser-bridged provider

**Goal:** drive a browser-based chat UI as if it were an OpenAI endpoint.

- [ ] Pick one chat UI (e.g. ChatGPT or Claude.ai).
- [ ] Use a real automation library (Playwright or similar).
- [ ] Browser session is the credential holder — no API keys.
- [ ] Implement the `Provider` interface on top of the browser session.
- [ ] Streaming via scraping the UI's incremental output.

**Exit criteria:** a request for `browser-chatgpt-4o` returns a completion
sourced from a real browser session, with no API key in the relay's
environment.

## Milestone 6 — Hardening

**Goal:** make the relay safe to leave running.

- [ ] Structured logging with redaction.
- [ ] Prometheus metrics endpoint.
- [ ] Graceful backpressure under load.
- [ ] Failure-mode tests (provider down, malformed upstream response).
- [ ] Security review of the provider registry — confirm no bypass paths.

**Exit criteria:** relay runs for 24h under mixed load without leaking
credentials, dropping requests silently, or growing memory unbounded.
