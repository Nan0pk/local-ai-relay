# local-ai-relay

Local-first bridge from OpenAI-compatible clients such as Hermes to API,
local-model, and user-authenticated webchat providers.

> **Current status:** `browser-chatgpt-free` is working and Fedora-verified.
> Nine additional first-party webchats are selected but are not advertised as
> usable until each passes its own live end-to-end test.

## Working now

| Model ID | Backend | Status |
|---|---|---|
| `browser-chatgpt-free` | ChatGPT webchat | Fedora E2E verified |
| `mock-gpt-4o-mini` | Deterministic local mock | Test-only |

The relay supports OpenAI-style model discovery, chat completions, tool calls,
sticky browser conversations, and SSE compatibility for clients that request
`stream: true`. Browser output is returned after the website finishes; it is
not true upstream token streaming.

## Selected provider fleet

The next direct webchat adapters are Claude, Gemini, DeepSeek, Z.ai/GLM 5.2,
MiniMax M3, Kimi, Qwen, Grok, and Mistral Le Chat. See
[Provider fleet](docs/providers.md) for IDs, order, rationale, and status.

## Install or update on Linux

```bash
if [ -d "$HOME/local-ai-relay/.git" ]; then
  git -C "$HOME/local-ai-relay" pull --ff-only
else
  git clone https://github.com/Nan0pk/local-ai-relay.git "$HOME/local-ai-relay"
fi
cd "$HOME/local-ai-relay"
./setup-linux.sh
```

The setup performs a clean dependency check, tests, an occupied-port startup
smoke test, visible ChatGPT login/probe, systemd user-service installation,
and Hermes configuration. Login remains a normal browser action: the relay
never asks for passwords, cookies, session tokens, API keys, or GitHub tokens.

To validate code without opening a browser:

```bash
./setup-linux.sh --no-browser
```

## Hermes

The setup registers:

```text
provider: custom:local-ai-relay
model: browser-chatgpt-free
selector: custom:local-ai-relay:browser-chatgpt-free
```

Existing Hermes settings and custom providers are preserved, and the config is
backed up before modification. Start a new Hermes session after configuration.

## Operations

```bash
systemctl --user status local-ai-relay
journalctl --user -u local-ai-relay -f
npm run probe:chatgpt
```

The relay prefers `127.0.0.1:8787`. If occupied, it reuses an existing healthy
relay or selects the next free port through `8796`.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness |
| `GET` | `/v1/models` | Registered, usable models |
| `POST` | `/v1/chat/completions` | OpenAI-compatible completion/SSE |

```bash
curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'X-Relay-Session: demo' \
  -d '{
    "model":"browser-chatgpt-free",
    "messages":[{"role":"user","content":"Return three prioritized improvements."}]
  }'
```

## Repository map

```text
local-ai-relay/
├── src/
│   ├── browser/      Playwright transport, profiles, queue, ChatGPT driver
│   ├── cli/          setup, login, probe, service, and Hermes commands
│   ├── hermes/       non-destructive Hermes configuration
│   ├── providers/    registry, provider adapters, planning, tool bridge
│   ├── routes/       health, models, and chat-completions endpoints
│   ├── service/      systemd unit generation
│   ├── startup/      port selection and startup checks
│   ├── types/        OpenAI-compatible shared types
│   ├── config.ts     environment configuration
│   ├── server.ts     Fastify application factory
│   └── index.ts      process entrypoint
├── docs/
│   ├── providers.md  selected top-10 provider fleet
│   ├── architecture.md
│   ├── roadmap.md
│   ├── north-star.md
│   └── antigravity-e2e-report.md
├── setup-linux.sh
├── SECURITY.md
└── package.json
```

## Verification

```bash
npm ci
npm test
npm run build
npm run smoke:startup
```

The authenticated Fedora evidence is recorded in
[the E2E report](docs/antigravity-e2e-report.md).

## Boundaries

This is local UI automation, not an official provider API. It does not bypass
login, CAPTCHA, usage limits, access controls, or safety systems. Webchat
selectors can change without notice, and each adapter must remain isolated and
independently testable. See [SECURITY.md](SECURITY.md).

## License

No license has been selected yet. Treat the repository as source-available,
not open source, until a `LICENSE` file is added.
