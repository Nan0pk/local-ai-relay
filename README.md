# local-ai-relay

Local OpenAI-compatible relay for agent harnesses. It exposes one authenticated
loopback API and routes model IDs to local mock or browser-backed providers.

## What works

- `POST /v1/responses` — Responses API, including buffered SSE and tool calls.
- `POST /v1/chat/completions` — Chat Completions compatibility API.
- `GET /v1/models` — models currently ready in this runtime.
- `GET /v1/models?include=all` — complete registered model inventory and status.
- `GET /v1/providers/status` — provider readiness diagnostics.
- One command populates every registered model in Hermes and OpenCode.
- SQLite WAL-mode Idempotency Ledger tracking generation requests across restarts.
- Provider Control Plane CLI (`status`, `disable`, `enable`, `clear-evidence`) & global kill switch (`RELAY_BROWSER_KILL_SWITCH=1`).
- Heuristic Model Router (`src/router/model-router.ts`) supporting `auto`, `fast`, `smart` model alias fallback chains.
- Manifest V3 Web Extension Sidecar (`extension/`) for native browser loopback integration.
- Separate persistent browser profiles, serialized requests, sticky sessions,
  tool-call translation, bearer auth, CORS checks, and redacted logs.

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
cd ~ && export PATH=$HOME/.local/node/bin:$PATH && { if [ -d "local-ai-relay" ]; then cd local-ai-relay && git pull origin main; else git clone https://github.com/Nan0pk/local-ai-relay.git && cd local-ai-relay; fi; } && npm ci && npm run dev
```

### Step-by-Step Setup

One-line setup (idempotent; works even if directory exists or `npm` is in `$HOME/.local/node/bin`):

```bash
export PATH=$HOME/.local/node/bin:$PATH && ([ -d "local-ai-relay" ] || git clone https://github.com/Nan0pk/local-ai-relay.git) && cd local-ai-relay && npm ci && npm run dev
```

Or step-by-step:

```bash
# 1. Ensure working directory is user home
cd ~

# 2. Add Node 22 to PATH if installed locally
export PATH=$HOME/.local/node/bin:$PATH

# 3. Pull latest code if directory exists, or clone fresh if missing
if [ -d "local-ai-relay" ]; then
  cd local-ai-relay
  git pull origin main
else
  git clone https://github.com/Nan0pk/local-ai-relay.git
  cd local-ai-relay
fi

# 4. Install dependencies & start dev server
npm ci
npm run dev
```

*Note: Programmatic `.env` loading inside `src/config.ts` ensures `npm run dev` starts cleanly without crashing if `.env` does not exist on disk.*

`npm run dev` starts the relay on `http://127.0.0.1:8787` by default. Keep it running, then configure both supported harnesses:

```bash
npm run harnesses:configure
```

That command:

- reads all models from `/v1/models?include=all`;
- configures Hermes at `~/.hermes/config.yaml`;
- configures OpenCode at `~/.config/opencode/opencode.json`;
- switches both integrations to `/v1/responses`;
- writes the relay bearer token into each provider entry;
- preserves unrelated settings and creates `*.bak-local-ai-relay` backups.

Use `npm run hermes:configure` to update only Hermes. Set `HERMES_HOME` or
`OPENCODE_CONFIG` to override either config location.

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
bypass provider controls. Probes do not currently persist readiness across
service restarts.

## API

All endpoints except `/health` require the token stored at
`~/.local-ai-relay/token`, or `RELAY_API_TOKEN` when explicitly set.

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

## Verify

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run smoke:startup
npm run test:delivery
node scripts/validate-release.mjs
```

Authenticated live browser verification is separate:

```bash
npm run probe:<provider>
```

## Repository map

```text
src/routes/         health, models, Chat Completions, Responses
src/providers/      model registry and provider adapters
src/browser/        Patchright browser drivers and profiles
src/capabilities/   runtime readiness tracking
src/ledger/         SQLite WAL-mode idempotency transaction ledger
src/router/         heuristic model router and alias fallback chain
src/middleware/     sliding window rate limiting middleware
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
