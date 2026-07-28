# local-ai-relay

Local AI Relay gives coding agents and other OpenAI-compatible applications one
private local endpoint for several web-chat providers. Its Control Center shows
what is connected, guides sign-in, routes requests, explains failures, and can
add or remove harness integrations without replacing unrelated settings.

After installation, run:

```bash
npm run dashboard
```

That command starts the relay in the background when needed and opens the
polished local dashboard. You can also bookmark
[http://127.0.0.1:8787/ui](http://127.0.0.1:8787/ui) after the relay is
installed. If the default port is occupied, the launcher discovers the actual
port automatically.

## What works

- `POST /v1/responses` — Responses API, including buffered SSE and tool calls.
- `POST /v1/chat/completions` — Chat Completions compatibility API.
- `GET /v1/models` — models currently ready in this runtime.
- `GET /v1/models?include=all` — complete registered model inventory and status.
- `GET /v1/providers/status` — provider readiness diagnostics.
- `GET /openapi.json` — generated OpenAPI 3.1 contract; the same document is
  committed at `docs/openapi.json`.
- `/ui` — responsive, token-in-memory provider/routing/harness Control Center.
- Guided provider connections with official-site links, background live-probe
  jobs, current status, redacted error activity, and 24-hour readiness evidence.
- Persistent manual, priority, and automatic routing through `relay-auto`, with
  allowed-provider selection, live success/latency adjustment, and logged
  failover to another ready provider.
- Reversible Hermes and OpenCode integration with per-harness revocable tokens,
  backups, disconnect-one, and disconnect-all actions.
- Generic OpenAI-compatible connection details for testing another harness.
- Optional Native Messaging companion heartbeat shown in the dashboard.
- An MCP stdio server exposes model listing, provider status, and delegation.
- One explicit command populates every registered model in Hermes and OpenCode.
- Provider capability tracking with expiring evidence and a global kill switch (`RELAY_BROWSER_KILL_SWITCH=1`).
- Separate persistent browser profiles, serialized requests, sticky sessions,
  tool-call translation, bearer auth, CORS checks, and redacted logs.

The SQLite ledger and sliding-window rate limiter are tested building blocks but
are not wired into the HTTP request path. The new persistent control-plane
router is wired into both Responses and Chat Completions through `relay-auto`.

The Manifest V3 extension and Native Messaging host are an **optional status
bridge**, not an inference transport. It checks in without page-content
permissions, and its live/offline status appears in the dashboard. Patchright
with isolated, persistent relay profiles remains the working browser transport.

`/v1` remains the public OpenAI-compatible URL prefix. New harness plumbing uses
the Responses API; Chat Completions remains for older clients.

Browser adapters exist for every model below. Adapter code and mock tests do not
mean a provider is logged in or live-ready. All registered models appear in
harness catalogs; OpenCode labels unready entries. Default `/v1/models`
discovery remains readiness-gated.

## Quickstart — Run from Source

### Requirements
- **Node.js 22+**, Git, and Chrome/Chromium for browser providers.
- **Node PATH Note**: If Node 22 is installed locally under `$HOME/.local/node/bin`, ensure your active PATH includes it: `export PATH=$HOME/.local/node/bin:$PATH`.

### One-Line Setup (Fail-Safe, Auto-Updating & Idempotent)
Run from your home directory (`~`):

```bash
cd ~ && export PATH="$HOME/.local/node/bin:$PATH" && { if [ -e local-ai-relay ] && [ ! -d local-ai-relay/.git ]; then printf '%s\n' 'ERROR: ~/local-ai-relay exists but is not a Git checkout; move it aside manually.' >&2; exit 1; elif [ -d local-ai-relay/.git ]; then git -C local-ai-relay fetch origin main && git -C local-ai-relay merge --ff-only origin/main; else git clone https://github.com/Nan0pk/local-ai-relay.git; fi; } && cd local-ai-relay && npm ci && npm run dashboard
```

### Step-by-Step Setup

```bash
# 1. Ensure working directory is user home
cd ~

# 2. Add Node 22 to PATH if installed locally
export PATH=$HOME/.local/node/bin:$PATH

# 3. Fast-forward a valid checkout, clone if absent, and preserve unexpected data
if [ -d "local-ai-relay/.git" ]; then
  git -C local-ai-relay fetch origin main
  git -C local-ai-relay merge --ff-only origin/main
elif [ -e "local-ai-relay" ]; then
  echo "ERROR: ~/local-ai-relay exists but is not a Git checkout; move it aside manually." >&2
  exit 1
else
  git clone https://github.com/Nan0pk/local-ai-relay.git
fi
cd local-ai-relay

# 4. Install dependencies, start the relay, and open its Control Center
npm ci
npm run dashboard
```

*Note: Programmatic `.env` loading inside `src/config.ts` ensures `npm run dev` starts cleanly without crashing if `.env` does not exist on disk.*

`npm run dashboard` starts a detached relay on `http://127.0.0.1:8787` by
default, opens the page in the default browser, and prints the token-file
location. Use `npm run dashboard -- --no-open` on a headless machine. For
foreground development with automatic reload, use `npm run dev`.

## Control Center workflow

1. Unlock the page with the token in `~/.local-ai-relay/token`. The page keeps
   it only in memory; Lock or closing the tab forgets it.
2. For a provider marked **Login optional**, choose **Connect** and let the live
   check finish.
3. For a provider that requires an account, choose **Connect**. The relay opens
   the official site in its dedicated persistent Chrome profile. Complete
   login, account selection, 2FA, or CAPTCHA yourself; the check continues
   automatically when the chat composer is ready.
4. **Open site** opens the provider in your currently running/default browser.
   It is useful for account management, but browsers intentionally do not let
   the relay copy that session into its automation profile.
5. Select allowed providers and Automatic, Priority, or Manual routing. Clients
   can request `relay-auto`; the response headers and Activity panel explain
   the selected model and any failover.
6. Connect Hermes, OpenCode, or Generic OpenAI-compatible clients from the
   Harnesses panel. Each receives its own revocable key.

The relay never collects provider passwords and does not bypass login controls.
Browser cookies remain in separate local profiles under
`~/.local-ai-relay/browser-profiles/`.

The older command-line configurator remains available:

```bash
npm run harnesses:configure
```

If the requested port is occupied, the relay selects one of the next nine
ports and records it locally. Harness configuration, MCP, and health checks
discover the running port automatically. Tool-specific URL overrides such as
`LOCAL_AI_RELAY_DAEMON_URL` still take precedence.

That legacy command:

- reads all models from `/v1/models?include=all`;
- configures Hermes at `~/.hermes/config.yaml`;
- configures OpenCode at `~/.config/opencode/opencode.json`;
- switches both integrations to `/v1/responses`;
- writes the main relay bearer token into each provider entry (the dashboard's
  scoped per-harness keys are preferred);
- preserves unrelated settings and creates `*.bak-local-ai-relay` backups.

Use `npm run hermes:configure` to update only Hermes. Set `HERMES_HOME` or
`OPENCODE_CONFIG` to override either config location.

### Remove integrations or test another harness

Use **Disconnect** beside one harness, or **Disconnect all** in the dashboard.
The control plane:

- deletes only the `local-ai-relay` provider entry it owns;
- restores the prior Hermes model selection when the relay had switched it;
- leaves all unrelated themes, providers, and settings untouched;
- revokes the removed harness's scoped token immediately;
- retains timestamped configuration backups for manual recovery.

Choose **Generic OpenAI-compatible client → Connect** to test a different
harness. Copy the one-time `base_url`, scoped `api_key`, and `relay-auto` model
shown by the dashboard. Disconnect Generic when finished to revoke that key.

Daemon startup does not edit shell startup files or harness configurations by
default. Set `RELAY_AUTO_CONFIGURE_HARNESSES=1` only if that repeated,
operator-authorized behavior is desired.

No stable tagged release is currently published. The bootstrap files implement
authenticated, version-pinned release installation; they are not a mutable
`main` installer and should not be advertised as one until a release exists.

## Models

| Model ID | Backend |
|---|---|
| `relay-auto` | control-plane routing across allowed ready providers |
| `mock-gpt-4o-mini` | deterministic mock |
| `mock-gpt-4o` | deterministic mock |
| `browser-chatgpt-free` | ChatGPT |
| `browser-gemini-free` | Gemini |
| `browser-arena-free` | Arena |
| `browser-deepseek-free` | DeepSeek |
| `browser-zai-glm-5.2` | Z.ai |
| `browser-minimax-m3` | MiniMax |
| `browser-kimi-free` | Kimi |
| `browser-qwen-free` | Qwen |
| `browser-grok-free` | Grok |
| `browser-mistral-free` | Mistral |
| `browser-claude-free` | Claude |
| `browser-meta-free` | Meta AI |

Provider keys for login/probe commands: `chatgpt`, `claude`, `gemini`,
`deepseek`, `zai`, `minimax`, `kimi`, `qwen`, `grok`, `mistral`, and `meta`.
Arena uses the generic commands shown below.

```bash
npm run login:chatgpt
npm run probe:chatgpt

npm run browser:login -- --provider arena
node --import tsx src/cli/live-probe.ts --provider arena
```

Login, account selection, 2FA, and CAPTCHA remain manual. The relay does not
bypass provider controls. A successful authenticated live probe persists
readiness evidence for 24 hours; expired evidence is automatically removed from
default model discovery.

Except for the deterministic mock providers, a registered adapter is not proof
that a model is usable. Most provider reports currently record mock coverage
only; run the corresponding authenticated probe on the target machine before
depending on it.

## API

All API and specification endpoints require the token stored at
`~/.local-ai-relay/token`, or `RELAY_API_TOKEN` when explicitly set. `/health`
and the static `/ui`/`/dashboard` shell are public; the dashboard cannot read
provider or model data until the token is entered.

```bash
TOKEN=$(cat ~/.local-ai-relay/token)

curl -s http://127.0.0.1:8787/v1/responses \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"model":"mock-gpt-4o-mini","input":"Return three improvements."}'
```

Streaming:

```bash
curl -N http://127.0.0.1:8787/v1/responses \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"model":"mock-gpt-4o-mini","input":"Count to three.","stream":true}'
```

Chat Completions remains available:

```bash
curl -s http://127.0.0.1:8787/v1/chat/completions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"model":"mock-gpt-4o-mini","messages":[{"role":"user","content":"Hello"}]}'
```

The relay binds to loopback by default. Non-loopback binding requires both
`RELAY_UNSAFE_BIND_ACK=1` and an explicit `RELAY_API_TOKEN`.

The container image keeps that private default. `docker-compose.yml` binds the
process to the container interface but publishes it only on the host's
`127.0.0.1`; it also refuses to start until `RELAY_API_TOKEN` is supplied.

## MCP

Start the relay first, then launch the stdio MCP process. It uses
`LOCAL_AI_RELAY_TOKEN` when set, otherwise the same token source as the relay:

```bash
npm run mcp
```

Use `LOCAL_AI_RELAY_DAEMON_URL` to target a non-default loopback relay port.
For credential safety, the MCP client accepts only explicit `127.0.0.1` or
`::1` HTTP(S) origins and never follows authenticated redirects.

The verified MCP surface is deliberately small:

- `relay_list_models`
- `relay_get_provider_status`
- `relay_delegate_request`

Login, probing, evidence mutation, diagnostics export, cancellation, and
Streamable HTTP are not yet exposed through MCP.

## Experimental extension control bridge

The unpacked extension has no page-content privileges and does not transport
prompts. It reports a heartbeat to the Native Messaging host so the dashboard
can show whether the optional existing-browser companion is present. To install
the bounded bridge on Linux or macOS:

1. Open `chrome://extensions`, enable Developer mode, and load the repository's
   `extension/` directory unpacked.
2. Copy the generated extension ID.
3. Preview, then install the native host:

   ```bash
   npm run setup:native-host -- --extension-id=<32-character-id> --dry-run
   npm run setup:native-host -- --extension-id=<32-character-id>
   ```

4. Open the extension popup and select **Test native host**. The dashboard's
   Browser companion card should move to Connected.

Windows setup fails explicitly until a packaged executable host is available.
This bridge is an operator diagnostic. Provider inference remains in dedicated
relay browser profiles; the extension deliberately cannot read an existing
browser's provider tabs, passwords, or cookies.

## Add a future provider

Provider integration is registry-driven rather than hard-coded in the
dashboard. Add a driver descriptor in `src/browser/driver-registry.ts`, a
provider/model adapter in `src/providers/registry.ts`, and its deterministic
driver/provider tests. The Control Center, connection action, allowed-provider
selector, model catalog, error journal, and harness model lists then discover
it from those registries. Live readiness still requires a successful probe;
registration alone never marks a provider usable.

## Verify

One cross-platform command runs the dependency audit, typecheck, unit and
integration tests, deterministic 62-case E2E suite, build, startup smoke,
delivery tests, and release contract:

```bash
npm ci
npm run verify
```

Authenticated live browser verification is separate because provider login,
2FA, and CAPTCHA require the operator. Run one provider or all 12:

```bash
npm run probe:<provider>
npm run probe:all
```

`verify-all.sh` (Linux/macOS) and `verify-all.cmd` (Windows) combine the clean
install, deterministic matrix, and all live probes into one guided command.

## Repository map

```text
src/routes/         health, control plane, models, Chat Completions, Responses
src/control/        persistent routing, provider jobs, events, secure storage
src/harness/        reversible harness lifecycle and scoped integration ledger
src/ui/             dependency-free, CSP-safe Control Center assets
src/providers/      model registry and provider adapters
src/browser/        Patchright browser drivers and profiles
src/capabilities/   runtime readiness tracking
src/ledger/         SQLite ledger primitive (not wired into routes)
src/router/         heuristic router primitive (not wired into routes)
src/middleware/     error handling and rate-limit primitive
src/eval/           pairwise prompt evaluation harness
src/hermes/         Hermes config merge
src/opencode/       OpenCode config merge
src/cli/            login, probe, service, provider control, harness commands
extension/          Manifest V3 web extension sidecar
scripts/            release and probe tooling
docs/               architecture, provider evidence, plans, ADRs
```

See [SECURITY.md](SECURITY.md) for trust boundaries and
[docs/providers.md](docs/providers.md) for provider readiness policy.

Apache-2.0. See [LICENSE](LICENSE).
