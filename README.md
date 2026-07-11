# local-ai-relay

Local-first AI relay that lets agent harnesses talk to APIs, local models, and
browser chat interfaces through one OpenAI-compatible endpoint.

> **Status:** milestone 2 — experimental ChatGPT Free browser provider plus the
> deterministic mock. Browser output is non-streaming and ChatGPT's interface
> can change without notice. See [docs/roadmap.md](docs/roadmap.md).

## What it is

`local-ai-relay` is a small HTTP server that speaks the OpenAI Chat Completions
API (`/v1/chat/completions`, `/v1/models`). Agent harnesses (Claude Code,
Cursor, custom LangChain/LlamaIndex apps, etc.) point their `OPENAI_BASE_URL`
at the relay and get one stable surface, no matter what backend serves the
request.

The relay is **local-first**: it runs on your machine, holds any credentials
in your environment, and never proxies through a third party. Backends are
pluggable providers. The mock validates the API contract, while
`browser-chatgpt-free` drives a dedicated, user-authenticated Playwright
profile. The relay never asks for or extracts a web session token.

## Quick start

```bash
npm install
npm run build
cp .env.example .env   # optional: tweak host/port
npm start
```

The server listens on `127.0.0.1:8787` by default.

## ChatGPT Free browser setup (Linux first)

Install the relay-owned Chromium build and open its dedicated profile:

```bash
npm run browser:install
npm run browser:login
```

Sign into ChatGPT normally in that window. Once the composer is visible, close
login mode with `Ctrl+C`, start the relay, and request
`browser-chatgpt-free`. Do not paste a password, cookie, or session token into
the relay. The profile defaults to
`~/.local-ai-relay/browser-profiles/chatgpt`; do not replace it with your
everyday Chrome profile.

```bash
npm start

curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'X-Relay-Session: demo-mission' \
  -d '{
    "model": "browser-chatgpt-free",
    "messages": [
      {"role":"user","content":"Inspect the design."},
      {"role":"user","content":"Then return three prioritized improvements."}
    ]
  }'
```

The provider packages related messages into one batch mission. Reusing
`X-Relay-Session` keeps the ChatGPT conversation sticky; a forked history
starts a fresh browser conversation. Browser work is serialized to avoid
overlapping a stateful Free session.

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

`GET /v1/models` includes an `x_relay` capability hint. Harnesses can discover
that browser models prefer batched work and accept one active request.

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
  providers/          provider interface, registry, browser + mock impls
  browser/            Playwright transport, queue, ChatGPT driver
  cli/                dedicated-profile login command
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

## Browser-provider boundaries

This is user-controlled UI automation, not an official ChatGPT API. It does
not bypass login, CAPTCHA, usage limits, access controls, or safety checks.
Availability and permitted use remain subject to the service's current terms.
Selectors are isolated in the browser driver because the website can change.
