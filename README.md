# local-ai-relay

Local-first AI relay that lets agent harnesses talk to APIs, local models, and
browser chat interfaces through one OpenAI-compatible endpoint.

> **Status:** milestone 1 — mock provider only. No real LLM calls, no browser
> automation, no streaming. See [docs/roadmap.md](docs/roadmap.md).

## What it is

`local-ai-relay` is a small HTTP server that speaks the OpenAI Chat Completions
API (`/v1/chat/completions`, `/v1/models`). Agent harnesses (Claude Code,
Cursor, custom LangChain/LlamaIndex apps, etc.) point their `OPENAI_BASE_URL`
at the relay and get one stable surface, no matter what backend serves the
request.

The relay is **local-first**: it runs on your machine, holds any credentials
in your environment, and never proxies through a third party. Backends are
pluggable providers — the first one shipped is a mock so the surface can be
validated end-to-end before any real provider is wired in.

## Quick start

```bash
npm install
npm run build
cp .env.example .env   # optional: tweak host/port
npm start
```

The server listens on `127.0.0.1:8787` by default.

## Endpoints

| Method | Path                     | Purpose                                    |
| ------ | ------------------------ | ------------------------------------------ |
| GET    | `/health`                | Liveness probe.                            |
| GET    | `/v1/models`             | List registered models (OpenAI-shaped).    |
| POST   | `/v1/chat/completions`   | Chat completion (mock in milestone 1).     |

### Example

```bash
curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "mock-gpt-4o-mini",
    "messages": [{ "role": "user", "content": "ping" }]
  }'
```

Returns a deterministic mock completion with realistic `usage` counts.

## Configuration

All config is via environment variables — see [`.env.example`](.env.example)
for the full list. No secrets are required for milestone 1.

## Project layout

```
src/
  index.ts            process entry, graceful shutdown
  server.ts           Fastify factory + route wiring
  config.ts           env → typed config
  routes/             /health, /v1/models, /v1/chat/completions
  providers/          provider interface, registry, mock impl
  types/              OpenAI-compatible request/response types
docs/
  north-star.md       product vision
  architecture.md     component layout & data flow
  roadmap.md          milestone plan
SECURITY.md           threat model & secret-handling rules
```

## Why "no provider bypass"?

The relay routes model ids to registered providers through one code path. There
is no shortcut that lets a request skip the registry and hit a hardcoded
upstream. This keeps auth, logging, and rate-limiting in one place as real
providers are added — see [SECURITY.md](SECURITY.md).

## License

TBD — not yet licensed. Treat as source-available until a LICENSE file lands.
