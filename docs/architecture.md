# Architecture

## Components

```
                ┌──────────────────────────────────────────────┐
                │                  Fastify app                  │
                │                                              │
   HTTP  ─────► │  routes/health   routes/models   routes/chat │
                │       │               │              │       │
                │       │               │              ▼       │
                │       │               │       providers/registry
                │       │               │         ┌─────┴─────┐
                │       │               │         │           │
                │       │               │      MockProvider  (future: OpenAI, Anthropic, browser)
                │       │               │         │           │
                └───────┴───────────────┴─────────┴───────────┘
                                    │
                                    ▼
                              types/openai.ts   (shared request/response shapes)
```

### `src/server.ts` — Fastify factory

Owns app construction, logger config, and route registration. Pure factory —
no side effects until `app.listen()` is called by `src/index.ts`. This split
lets tests build an in-process app instance with `inject()` without binding
to a port.

### `src/routes/`

Three route modules, each registering exactly one OpenAI-shaped surface:

- `health.ts` — `GET /health`. Liveness only; no auth.
- `models.ts` — `GET /v1/models`. Calls `listAllModels()` on the registry.
- `chat.ts` — `POST /v1/chat/completions`. Validates the request, resolves
  the model → provider via the registry, calls `provider.complete()`, and
  converts thrown errors into OpenAI-shaped error responses.

Routes never reach around the registry. There is no `if model.startsWith('gpt')`
shortcut. Adding a provider means registering it; routing code stays put.

### `src/providers/`

- `types.ts` — `Provider` interface: `id`, `listModels()`, `complete()`.
- `registry.ts` — builds an in-memory `model → provider` map at startup and
  exposes `findProviderForModel()` and `listAllModels()`. Unknown models
  yield `undefined`, which the chat route turns into a 404.
- `mock.ts` — `MockProvider`. Returns deterministic, OpenAI-shaped responses.
  Token counts are crude word-count estimates; replaced with a real tokenizer
  when the first real provider lands.

### `src/config.ts`

Reads env vars into a typed `AppConfig`. No file reads, no secret parsing.
Defaults are safe for milestone 1 (`127.0.0.1:8787`, log level `info`,
default model `mock-gpt-4o-mini`).

### `src/types/openai.ts`

Shared request/response types. Strict enough to compile under
`--strict --noUnusedLocals --noUnusedParameters`, loose enough that later
milestones can extend without a rewrite (streaming chunks, tool calls, etc.).

## Data flow (milestone 1)

1. Client sends `POST /v1/chat/completions` with `{ model, messages }`.
2. `routes/chat.ts` validates `messages` is a non-empty array.
3. If `model` is omitted, falls back to `config.defaultModel`.
4. Registry resolves the model → provider. Unknown → 404.
5. If `stream: true` → 400 (streaming lands in a later milestone).
6. Provider returns a `ChatCompletionResponse`. Errors → 500 with an
   OpenAI-shaped body.
7. Response is sent as JSON.

## Trust boundary

- **In scope:** the relay itself. It owns auth, logging, model routing,
  and error shaping.
- **Out of scope (milestone 1):** outbound TLS to real providers, key
  rotation, request signing. Those arrive with the first real provider.
- **Standing rule:** no provider-bypass logic. Even internal "admin" or
  "debug" paths must go through the registry, so logging and auth can't
  be silently skipped.

## What's NOT here (deliberately)

- **No streaming.** Milestone 1 returns complete responses only.
- **No auth middleware.** The relay binds to `127.0.0.1` by default; adding
  a bearer-token gate is a roadmap item, not a milestone-1 concern.
- **No persistence.** No request log to disk, no DB. Logs go to stdout.
- **No browser automation.** Browser-bridged providers are a later
  milestone and will live behind the same `Provider` interface.
