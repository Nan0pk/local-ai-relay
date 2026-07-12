# local-ai-relay

Local-first AI relay that lets agent harnesses talk to APIs, local models, and
browser chat interfaces through one OpenAI-compatible endpoint.

> **Status:** milestone 2 — experimental ChatGPT Free browser provider plus the
> deterministic mock. Browser output is emitted after the web response completes and ChatGPT's interface
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

## Requirements

- Git
- Node.js 22 or newer
- npm

## Linux setup or update

Copy and paste this complete block from any directory. It clones the project
when missing and updates the existing checkout when it is already installed:

```bash
if [ -d "$HOME/local-ai-relay/.git" ]; then
  git -C "$HOME/local-ai-relay" pull --ff-only
else
  git clone https://github.com/Nan0pk/local-ai-relay.git "$HOME/local-ai-relay"
fi
cd "$HOME/local-ai-relay"
./setup-linux.sh
```

The setup program installs dependencies, creates local configuration, checks
the code, simulates startup with an occupied port, reuses installed Chrome when
available, opens ChatGPT for normal login, verifies one real message round
trip, installs a per-user background service, and configures Hermes when its
CLI is installed. It does not ask for a password, cookie, session token, API
key, or PAT.

Hermes is registered with a named provider, `local-ai-relay`, so its `/model`
screen can display and select `browser-chatgpt-free`. Existing Hermes settings
and other custom providers are preserved; a pre-change backup is saved beside
`~/.hermes/config.yaml`.

After setup reports `SETUP COMPLETE`, the relay is already running. Inspect it
with:

```bash
systemctl --user status local-ai-relay
journalctl --user -u local-ai-relay -f
```

The server prefers `127.0.0.1:8787`. If another program owns that port, it
checks whether the relay is already running and otherwise selects the next
free port through `8796`, printing the selected address.

## ChatGPT Free browser setup (Linux first)

The setup command already runs the browser probe. These lower-level commands
are available when diagnosing or repeating only one stage:

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

To repeat the complete live browser validation:

```bash
npm run probe:chatgpt
```

It checks Node and the Linux graphical session, installs relay Chromium if
needed, opens the dedicated profile, waits for the composer, sends one harmless
message, and verifies that final response extraction works. Login is the only
manual step.

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

For clients such as Hermes that request streaming, the relay returns a valid
SSE stream after ChatGPT finishes. This preserves OpenAI client compatibility;
it does not make the browser backend token-by-token realtime.

## Endpoints

| Method | Path                     | Purpose                                    |
| ------ | ------------------------ | ------------------------------------------ |
| GET    | `/health`                | Liveness probe.                            |
| GET    | `/v1/models`             | List registered models (OpenAI-shaped).    |
| POST   | `/v1/chat/completions`   | Chat completion through a chosen provider. |

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

## Verify the basic user journey

The startup smoke test builds the project, deliberately occupies the preferred
port, starts the relay as a user would, and verifies its `/health` response on
the automatically selected fallback port:

```bash
npm run smoke:startup
```

## Configuration

All config is via environment variables — see [`.env.example`](.env.example)
for the full list. The mock needs no secrets; browser authentication stays in
the dedicated local profile.

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
