# local-ai-relay

Local-first bridge from OpenAI-compatible clients such as Hermes to API,
local-model, and user-authenticated webchat providers.

> **Status:** `browser-chatgpt-free` is working and Fedora-verified.
> `browser-claude-free` is implemented and unit-tested; live authenticated
> verification is pending. Seven more webchats are selected but not yet
> implemented. A model appears in `/v1/models` and Hermes only after its
> live end-to-end test passes.

## Provider status

| Model ID | Backend | State | Verify with |
|---|---|---|---|
| `browser-chatgpt-free` | ChatGPT webchat | E2E verified | `npm run probe:chatgpt` |
| `browser-claude-free` | Claude webchat | Implemented, pending live E2E | `npm run probe:claude` |
| `mock-gpt-4o-mini` | Deterministic local mock | Test-only | `npm test` |
| `browser-gemini-free` | Gemini webchat | Selected | — |
| `browser-deepseek-free` | DeepSeek webchat | Selected | — |
| `browser-zai-glm-5.2` | Z.ai webchat | Selected | — |
| `browser-minimax-m3` | MiniMax Agent webchat | Selected | — |
| `browser-kimi-free` | Kimi webchat | Selected | — |
| `browser-qwen-free` | Qwen Chat webchat | Selected | — |
| `browser-grok-free` | Grok webchat | Selected | — |
| `browser-mistral-free` | Mistral Le Chat | Selected | — |

"Selected" means planned, not usable. See [Provider fleet](docs/providers.md)
for IDs, order, rationale, and per-provider E2E evidence under
`docs/e2e/<provider>.md`.

The relay supports OpenAI-style model discovery, chat completions, tool calls,
sticky browser conversations, and SSE compatibility for clients that request
`stream: true`. Browser output is returned after the website finishes; it is
not true upstream token streaming.

## Install or update

### Linux

```bash
if [ -d "$HOME/local-ai-relay/.git" ]; then
  git -C "$HOME/local-ai-relay" pull --ff-only
else
  git clone https://github.com/Nan0pk/local-ai-relay.git "$HOME/local-ai-relay"
fi
cd "$HOME/local-ai-relay"
./setup-linux.sh
```

`setup-linux.sh` performs a clean dependency check, tests, an occupied-port
startup smoke test, visible ChatGPT login/probe, systemd user-service
installation, and Hermes configuration. Login remains a normal browser
action: the relay never asks for passwords, cookies, session tokens, API
keys, or GitHub tokens.

To validate code without opening a browser:

```bash
./setup-linux.sh --no-browser
```

### Windows (PowerShell)

There is no `setup-windows.ps1` yet. Set up manually — these are the
same stages as `setup-linux.sh` minus the systemd service:

```powershell
cd $HOME
git clone https://github.com/Nan0pk/local-ai-relay.git
cd local-ai-relay
npm install
copy .env.example .env
npm run browser:install
npm run typecheck
npm test
npm run build
npm run smoke:startup
```

The systemd service stage does not apply on Windows. The browser login,
probe, and driver-smoke commands below all work on Windows. Login remains
a normal browser action: the relay never asks for passwords, cookies,
session tokens, API keys, or GitHub tokens.

## Verify a browser provider

Each browser provider ships behind a dedicated isolated profile under
`~/.local-ai-relay/browser-profiles/<provider>` and must be authenticated
once before it is usable. Run these on a machine with a visible graphical
browser session.

### Linux / macOS (bash)

```bash
cd ~/local-ai-relay
git pull --ff-only
npm ci

# 1. Open the dedicated profile and sign in normally in the visible window.
#    Do not paste cookies or tokens into the relay. When the provider's
#    composer is visible, return here and press Ctrl+C.
npm run login:<provider>

# 2. Run the live probe. It waits for the composer, sends one harmless
#    marker prompt, and prints PASS + the conversation URL.
npm run probe:<provider>
```

### Windows (PowerShell)

```powershell
cd $HOME\local-ai-relay
git pull --ff-only
npm install

# 1. Open the dedicated profile and sign in normally in the visible window.
#    Do not paste cookies or tokens into the relay. When the provider's
#    composer is visible, return here and press Ctrl+C.
npm run login:<provider>

# 2. Run the live probe. It waits for the composer, sends one harmless
#    marker prompt, and prints PASS + the conversation URL.
npm run probe:<provider>
```

Known `<provider>` values: `chatgpt`, `claude`. A provider appears in
`/v1/models` and Hermes only after its probe and a real Hermes tool round
trip pass; record the sanitized evidence under `docs/e2e/<provider>.md`.

If a probe fails, the driver throws a typed `BrowserFailure` with one of:
`login_required`, `captcha`, `rate_limit`, `quota_exhausted`,
`composer_disabled`, `generation_interrupted`, `layout_changed`, `timeout`.
The relay never bypasses CAPTCHA, authentication, rate limits, or safety
systems. A local screenshot is saved under
`~/.local-ai-relay/diagnostics/` (set `RELAY_DIAGNOSTICS=0` to disable).

## Hermes

The setup registers the `local-ai-relay` named provider and every model the
running relay advertises in `/v1/models`:

```text
provider:  custom:local-ai-relay
default:   browser-chatgpt-free
selector:  custom:local-ai-relay:<model-id>
```

Example selectors:

```text
custom:local-ai-relay:browser-chatgpt-free
custom:local-ai-relay:browser-claude-free   # after Claude E2E passes
```

Existing Hermes settings and custom providers are preserved, and the config
is backed up before modification. Start a new Hermes session after
configuration. To re-register after a provider lands or changes, rerun
`npm run hermes:configure`.

## Operations

### Linux (systemd service)

```bash
systemctl --user status local-ai-relay
journalctl --user -u local-ai-relay -f
```

### All platforms (browser login, probe, smoke)

```bash
# Per-provider login + live probe (visible browser required).
# Run login first, sign in normally, Ctrl+C when the composer is visible,
# then run the probe:
npm run login:chatgpt
npm run probe:chatgpt

npm run login:claude
npm run probe:claude

# Headless driver-plumbing smoke (no login required; verifies the driver
# loads the live site and detects the unauthenticated state):
npm run smoke:claude-driver
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
│   ├── browser/      Playwright transport, profiles, queue, per-site drivers
│   │                 (chatgpt-driver.ts, claude-driver.ts, driver-registry.ts)
│   ├── cli/          setup, login, probe, service, and Hermes commands
│   ├── hermes/       non-destructive Hermes configuration (multi-model)
│   ├── providers/    registry, provider adapters, planning, tool bridge
│   ├── routes/       health, models, and chat-completions endpoints
│   ├── service/      systemd unit generation
│   ├── startup/      port selection and startup checks
│   ├── types/        OpenAI-compatible shared types
│   ├── config.ts     environment configuration
│   ├── server.ts     Fastify application factory
│   └── index.ts      process entrypoint
├── scripts/          driver-plumbing smoke scripts
├── docs/
│   ├── providers.md  selected top-10 provider fleet
│   ├── e2e/          per-provider sanitized E2E evidence
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
[the E2E report](docs/antigravity-e2e-report.md) and per-provider under
`docs/e2e/`.

## Boundaries

This is local UI automation, not an official provider API. It does not bypass
login, CAPTCHA, usage limits, access controls, or safety systems. Webchat
selectors can change without notice, and each adapter must remain isolated and
independently testable. See [SECURITY.md](SECURITY.md).

## License

No license has been selected yet. Treat the repository as source-available,
not open source, until a `LICENSE` file is added.
