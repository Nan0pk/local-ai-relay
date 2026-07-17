# local-ai-relay

Local-first bridge from OpenAI-compatible clients such as Hermes to API,
local-model, and user-authenticated webchat providers.

> **Status:** `browser-chatgpt-free`, `browser-gemini-free`, and
> `browser-meta-free` are E2E verified.
> All remaining webchats (Claude, DeepSeek, Z.ai, MiniMax, Kimi, Qwen,
> Grok, Mistral) are implemented, unit-tested, and registered in
> `/v1/models`.
> Live authenticated E2E verification is still pending for each individually.

## Ethos

One command to install. One command to verify everything. Anything that
can be automated, is. The user never manually `git pull`s, `Remove-Item`s,
`git clone`s, or runs ten separate `npm run` pairs. Sign-in is the only
manual step, because only a human can sign in to a website — and that's
a normal browser action, not relay work.

## Provider status

| Model ID | Backend | State |
|---|---|---|
| `browser-chatgpt-free` | ChatGPT webchat | E2E verified |
| `browser-claude-free` | Claude webchat | Registered |
| `browser-gemini-free` | Gemini webchat | E2E verified |
| `browser-deepseek-free` | DeepSeek webchat | Registered |
| `browser-zai-glm-5.2` | Z.ai webchat | Registered |
| `browser-minimax-m3` | MiniMax Agent webchat | Registered |
| `browser-kimi-free` | Kimi webchat | Registered |
| `browser-qwen-free` | Qwen Chat webchat | Registered |
| `browser-grok-free` | Grok webchat | Registered |
| `browser-mistral-free` | Mistral Le Chat | Registered |
| `browser-meta-free` | Meta AI webchat | E2E verified |
| `mock-gpt-4o-mini` | Deterministic local mock | Test-only |

"Implemented, pending live E2E" means the driver, adapter, unit tests, and
CLI commands pass `npm test` / `npm run build` / `npm run smoke:startup`,
but the provider is NOT registered in `/v1/models` or Hermes until a real
authenticated probe + Hermes tool round trip passes. See
[Provider fleet](docs/providers.md) and per-provider evidence under
`docs/e2e/<provider>.md`.

The relay supports OpenAI-style model discovery, chat completions, tool calls,
sticky browser conversations, and SSE compatibility for clients that request
`stream: true`. Browser output is returned after the website finishes; it is
not true upstream token streaming.

## Install — one command

From anywhere, even a fresh machine with nothing cloned. The bootstrap
handles every repository state: no clone, healthy clone, stale clone, broken
clone. Node.js 22+, Git, and Google Chrome must already be installed.

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/bootstrap.sh | bash
```

### Windows (PowerShell)

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/bootstrap.ps1)))
```

If `irm` is blocked by your org's policy, download-and-run works too:

```powershell
curl.exe -fsSL https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/bootstrap.ps1 -o bootstrap.ps1
powershell -ExecutionPolicy Bypass -File bootstrap.ps1
```

That's it. The bootstrap clones or fast-forwards a verified checkout as needed,
then runs setup: dependency check, tests, occupied-port startup smoke,
visible ChatGPT login/probe, a background relay (systemd on Linux; detached
local process on Windows), and Hermes configuration. Login remains a normal
browser action: the relay never asks
for passwords, cookies, session tokens, API keys, or GitHub tokens.

Bootstrap never deletes a checkout because a pull fails. Non-repository or
unexpected-origin directories are renamed to
`local-ai-relay.backup-<timestamp>` so `.env`, diagnostics, logs, and local
patches survive. Intentional deletion requires `--fresh --yes` on Linux/macOS
or `-Fresh -Yes` on Windows.

Setup uses the Chrome already installed on Windows, macOS, or Linux with an
isolated relay profile; it does not download the roughly 168 MB managed
Chromium build. For machines without Chrome, the managed fallback is explicit:
`npm run browser:install`.

## Verify all providers — one command

After install, verify every unverified provider in one shot. The script
runs setup, then for each of the 10 providers: opens the login window,
waits for you to sign in normally and press a key, runs the live probe,
and records PASS/FAIL. At the end it prints a summary table.

### Linux / macOS

```bash
cd ~/local-ai-relay && ./verify-all.sh
```

### Windows (PowerShell)

```powershell
cd $HOME\local-ai-relay; .\verify-all.cmd
```

Paste the final SUMMARY block back. For any FAIL, also paste that
provider's error output. Sign-in is the only manual step — a browser
window opens for each provider, you sign in normally, press a key, and
the probe runs automatically.

## Per-provider commands (optional)

The bootstrap and verify-all scripts cover everything. These are here for
ad-hoc use or debugging a single provider.

```bash
npm run login:<provider>      # open the dedicated profile, sign in, Ctrl+C
npm run probe:<provider>      # live probe: sends marker prompt, prints PASS/URL
npm run smoke:claude-driver   # headless driver-plumbing smoke (no login)
```

Known `<provider>` values: `chatgpt`, `claude`, `gemini`, `deepseek`,
`zai`, `minimax`, `kimi`, `qwen`, `grok`, `mistral`, `meta`.

If a probe fails, the driver throws a typed `BrowserFailure` with one of:
`login_required`, `captcha`, `rate_limit`, `quota_exhausted`,
`composer_disabled`, `generation_interrupted`, `layout_changed`, `timeout`.
The relay never bypasses CAPTCHA, authentication, rate limits, or safety
systems. A local screenshot is saved under
`~/.local-ai-relay/diagnostics/` (set `RELAY_DIAGNOSTICS=0` to disable).

## Hermes

Setup registers the `local-ai-relay` named provider and every model the
running relay advertises in `/v1/models`:

```text
provider:  custom:local-ai-relay
default:   browser-chatgpt-free
selector:  custom:local-ai-relay:<model-id>
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

### Windows (background relay)

Setup starts the built relay as a hidden detached process and records its PID,
active port, and log under `.relay-browser/`. Rerunning setup safely replaces
the process with the current build.

### All platforms

```bash
./verify-all.sh        # Linux/macOS — verify every provider in one shot
.\verify-all.cmd       # Windows     — same
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
├── bootstrap.sh / bootstrap.ps1   one-liner install entry points
├── verify-all.sh / verify-all.cmd one-liner verify-all-providers entry points
├── setup-linux.sh / setup-windows.cmd / setup-windows.ps1
├── src/
│   ├── browser/      Patchright transport, profiles, queue, per-site drivers
│   │                 (chatgpt, claude, gemini, deepseek, zai, minimax,
│   │                  kimi, qwen, grok, mistral, meta) + shared base-driver
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
│   ├── providers.md  selected provider fleet
│   ├── e2e/          per-provider sanitized E2E evidence
│   ├── architecture.md
│   ├── roadmap.md
│   ├── north-star.md
│   └── antigravity-e2e-report.md
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

## Gemini Integration Guide

### 1. Gemini Login
To launch the browser interface and log into Gemini:
```bash
npm run login:gemini
```
This opens the browser pointing to Gemini. Log in normally and then press Ctrl+C in your terminal to close the browser safely and save the session.

### 2. Gemini Live Probe
To verify the state and availability of the Gemini provider:
```bash
npm run probe:gemini
```

Or to run the probe across all providers and show their classification status:
```bash
npm run probe:all
```

### 3. Run Gemini through the Relay
Once logged in, the local background service will automatically serve Gemini requests. You can submit requests directly using `curl`:

**Non-streaming completion:**
```bash
curl -s http://127.0.0.1:8788/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"browser-gemini-free","messages":[{"role":"user","content":"Count to 3."}]}'
```

**Streaming completion:**
```bash
curl -s http://127.0.0.1:8788/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"browser-gemini-free","stream":true,"messages":[{"role":"user","content":"Count to 3."}]}'
```

### 4. Configure Hermes for Gemini
To configure Hermes to advertise and route requests to `browser-gemini-free`:
```bash
npm run hermes:configure
```

### 5. Perform Real Hermes Verification
To verify the entire loop using the Hermes client:
```bash
hermes -z "Reply with exactly: BANANA" --provider "custom:local-ai-relay" --model "browser-gemini-free" --accept-hooks --yolo
```

### 6. Inspecting systemd Logs
To monitor requests, errors, or startup logs for the local-ai-relay service:
```bash
journalctl --user -u local-ai-relay -f
```

### 7. Resetting the Gemini Profile Safely
If you need to clear the Gemini state, cookies, or profile cache to restart clean:
```bash
rm -rf ~/.local-ai-relay/browser-profiles/gemini
```

## License

No license has been selected yet. Treat the repository as source-available,
not open source, until a `LICENSE` file is added.
