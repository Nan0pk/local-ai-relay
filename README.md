# local-ai-relay

Local OpenAI-compatible relay for agent harnesses. It exposes one authenticated
loopback API and routes model IDs to local mock or browser-backed providers.

## What works

- `POST /v1/responses` — Responses API, including buffered SSE and tool calls.
- `POST /v1/chat/completions` — Chat Completions compatibility API.
- `GET /v1/models` — models currently ready in this runtime.
- `GET /v1/models?include=all` — complete registered model inventory and status.
- `GET /v1/providers/status` — provider readiness diagnostics.
- `GET /openapi.json` — generated OpenAPI 3.1 contract; the same document is
  committed at `docs/openapi.json`.
- `/ui` — a minimal, token-in-memory status and prompt dashboard.
- An MCP stdio server exposes model listing, provider status, and delegation.
- One explicit command populates every registered model in Hermes and OpenCode.
- Provider capability tracking with expiring evidence and a global kill switch (`RELAY_BROWSER_KILL_SWITCH=1`).
- Separate persistent browser profiles, serialized requests, sticky sessions,
  tool-call translation, bearer auth, CORS checks, and redacted logs.

The SQLite ledger, heuristic alias router, and sliding-window rate limiter are
tested building blocks but are not wired into the HTTP request path. They are
not advertised as runtime guarantees.

The Manifest V3 extension and Native Messaging host are an **experimental
control bridge**, not a ready inference transport. Linux and macOS setup can be
dry-run or installed; Windows setup fails fast until a real executable launcher
is packaged. Patchright remains the working browser transport.

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
cd ~ && export PATH="$HOME/.local/node/bin:$PATH" && { if [ -e local-ai-relay ] && [ ! -d local-ai-relay/.git ]; then printf '%s\n' 'ERROR: ~/local-ai-relay exists but is not a Git checkout; move it aside manually.' >&2; exit 1; elif [ -d local-ai-relay/.git ]; then git -C local-ai-relay fetch origin main && git -C local-ai-relay merge --ff-only origin/main; else git clone https://github.com/Nan0pk/local-ai-relay.git; fi; } && cd local-ai-relay && npm ci && npm run dev
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

# 4. Install dependencies & start dev server
npm ci
npm run dev
```

*Note: Programmatic `.env` loading inside `src/config.ts` ensures `npm run dev` starts cleanly without crashing if `.env` does not exist on disk.*

`npm run dev` starts the relay on `http://127.0.0.1:8787` by default. Keep it running, then configure both supported harnesses:

```bash
npm run harnesses:configure
```

If the requested port is occupied, the relay selects one of the next nine
ports and records it locally. Harness configuration, MCP, and health checks
discover the running port automatically. Tool-specific URL overrides such as
`LOCAL_AI_RELAY_DAEMON_URL` still take precedence.

That command:

- reads all models from `/v1/models?include=all`;
- configures Hermes at `~/.hermes/config.yaml`;
- configures OpenCode at `~/.config/opencode/opencode.json`;
- switches both integrations to `/v1/responses`;
- writes the relay bearer token into each provider entry;
- preserves unrelated settings and creates `*.bak-local-ai-relay` backups.

Use `npm run hermes:configure` to update only Hermes. Set `HERMES_HOME` or
`OPENCODE_CONFIG` to override either config location.

Daemon startup does not edit shell startup files or harness configurations by
default. Set `RELAY_AUTO_CONFIGURE_HARNESSES=1` only if that repeated,
operator-authorized behavior is desired.

No stable tagged release is currently published. The bootstrap files implement
authenticated, version-pinned release installation; they are not a mutable
`main` installer and should not be advertised as one until a release exists.

## Models

| Model ID | Backend |
|---|---|
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
prompts. To test its bounded Native Messaging handshake on Linux or macOS:

1. Open `chrome://extensions`, enable Developer mode, and load the repository's
   `extension/` directory unpacked.
2. Copy the generated extension ID.
3. Preview, then install the native host:

   ```bash
   npm run setup:native-host -- --extension-id=<32-character-id> --dry-run
   npm run setup:native-host -- --extension-id=<32-character-id>
   ```

4. Open the extension popup and select **Test native host**.

Windows setup fails explicitly until a packaged executable host is available.
This handshake is an operator diagnostic, not the unfinished extension
inference vertical slice.

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
src/routes/         health, models, Chat Completions, Responses
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
