# Local AI Relay

**Open one local dashboard, connect an AI web chat, and use it from Hermes,
OpenCode, or any OpenAI-compatible client.**

[![CI](https://github.com/Nan0pk/local-ai-relay/actions/workflows/ci.yml/badge.svg)](https://github.com/Nan0pk/local-ai-relay/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-5ee6b0)](LICENSE)
[![Platforms](https://img.shields.io/badge/source_preview-Linux_x64_%7C_Windows_x64-5ee6b0)](#install-and-open)

> [!IMPORTANT]
> This is currently a **source preview**, not a signed desktop release. There is
> no standalone `bootstrap.sh` to download. Use the one command below from any
> directory. After the first run, start Local AI Relay from your application
> menu or desktop shortcut.

## Install and open

You need Git and Node.js 22 or newer.

### Linux x64

```bash
curl -fsSL https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/start-source.sh -o /tmp/local-ai-relay-start.sh && bash /tmp/local-ai-relay-start.sh
```

### Windows x64 — PowerShell

```powershell
$starter = Join-Path $env:TEMP 'local-ai-relay-start.ps1'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/start-source.ps1' -OutFile $starter; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $starter
```

The starter downloads or safely updates one managed checkout, installs locked
dependencies when needed, creates **Local AI Relay** in the application menu,
replaces any older running source revision, starts the loopback-only server, and
opens the unlocked Control Center. It does not modify a random clone or force a
provider login during installation.
The terminal also prints the local access token once, its protected storage
path, and the command for reopening the dashboard. Keep that token private.

## Get to work

The Control Center is the normal interface. No project coding is required.

1. **Let startup discovery run.** The dashboard quietly checks likely
   login-free chats one at a time and marks only end-to-end verified providers
   **Ready**. You can start with the first ready provider while the rest finish.
2. **Choose browser mode.** Click **Use this Chrome** if you want the relay to
   reuse logins already present in your normal Chrome profile. The dashboard
   gives the one-time extension installation path. Skip this step to use the
   isolated shared relay browser.
3. **Handle only providers that need you.** A card says **Sign-in / consent**,
   **Verification needed**, **Site changed**, or **Unavailable** instead of
   pretending the chat works. Click **Connect / check access** only for a
   provider you want to sign into.
4. **Connect your harness.** Choose Hermes, OpenCode, or **Generic
   OpenAI-compatible client**. Launch the installed harness and use model
   `relay-auto`.

The dashboard shows the local server, browser mode, every provider's live
connection stage, linked errors, harness integration state, routing policy,
setup checks, and a test box.

## Your browser choices

| Mode | What it does | Best for |
|---|---|---|
| **This Chrome** | A small unpacked extension opens relay-owned provider tabs in the Chrome profile you are already using. Existing provider sessions are available. | Least login friction |
| **Shared relay browser** | The relay opens one persistent browser profile shared by all providers. Sign in once there and the session survives restarts. | Isolation; no extension |
| **Managed Chromium fallback** | If no compatible Chrome/Chromium is installed, the relay downloads its own browser automatically on the first connection. | Fresh systems |

The extension does not copy cookies, ask for passwords, or automate arbitrary
personal tabs. It receives a narrowly scoped local key and can script only the
listed provider domains. Provider tabs are created and tracked by the relay.
OAuth, passkeys, 2FA, consent, and CAPTCHAs remain manual.

To stop using the existing profile, click **Disconnect this Chrome** in the
dashboard or **Forget relay** in the extension popup. Removing the extension
also removes its local key; re-pairing replaces any older server-side extension
key.

## Anonymous access changes—so the relay checks live

Provider login rules vary by region, quota, rollout, and time. A signed-out
submission audit on 29 July 2026 produced these actual outcomes:

| Provider | Signed-out result |
|---|---|
| Gemini, Z.ai, Qwen | Prompt submitted and expected response extracted |
| ChatGPT | Composer appeared, but Send redirected to OpenAI authentication/security verification |
| Kimi, Meta AI, Grok | Composer appeared, but Send opened a login gate |
| Arena | Required explicit Terms/Privacy consent before the first prompt |
| MiniMax | Composer appeared, but the prompt did not start without an account-ready session |
| DeepSeek | Redirected to sign-in |
| Claude, Mistral | Site verification prevented a conclusive signed-out test |

Only the first row is used to order automatic startup checks. Even that is not
blindly trusted: when the authenticated Control Center opens, it verifies those
providers sequentially in background tabs (or a headless shared relay browser)
on the operator's machine and adapts:

- usable composer → verify immediately;
- login or consent page → mark **Sign-in / consent** without opening an automatic login flow;
- CAPTCHA or site verification → mark **Verification needed** for manual action;
- quota, rate limit, layout change, timeout, or interrupted generation → show
  the classified error and a link to its event log.

Provider sites can still change independently of this project.

## Dashboard token

The normal desktop/application-menu launcher opens an authenticated URL and
unlocks the dashboard automatically. Every `npm run dashboard` invocation also
prints the token and its source in the terminal.

If you open a saved `http://127.0.0.1:.../ui` bookmark directly:

```bash
cat ~/.local-ai-relay/token
```

On Windows PowerShell:

```powershell
Get-Content "$env:USERPROFILE\.local-ai-relay\token"
```

Paste the result into **Relay bearer token**. The file remains owner-readable
only on supported Unix systems; do not post the token in logs or screenshots.

## Routing

Leave **Auto routing** enabled and request `relay-auto` for the simplest setup.
It selects only providers with current successful-use evidence.

Open **Provider choice and advanced routing** to:

- allow only selected providers;
- prefer reliability, speed, or your own priority order;
- lock requests to one provider model;
- allow or disable safe pre-submission fallback.

The relay does not fail over after an ambiguous timeout or interrupted
generation, avoiding accidental duplicate submissions.

## Harnesses and removal

### Hermes

The dashboard detects the executable and adds one `local-ai-relay` provider to
`~/.hermes/config.yaml`. It preserves other settings, keeps bounded backups, and
restores the prior model choice when disconnected.

### OpenCode

The dashboard adds only the `local-ai-relay` provider entry to
`~/.config/opencode/opencode.json` and preserves unrelated configuration.

### Any other client

Choose **Generic OpenAI-compatible client → Get settings**. You receive:

- base URL `http://127.0.0.1:8787/v1` (or the active local port);
- a dedicated revocable key;
- model `relay-auto`.

### Remove or test another harness

- **Disconnect** removes only the selected harness integration and revokes its
  key.
- **Disconnect all** removes every relay-owned harness entry and revokes all
  harness keys. Provider browser sessions are left intact.
- You can connect a different harness immediately; each integration has its own
  key and does not depend on the previous harness.
- To preview cleanup in a terminal:

  ```bash
  cd "${XDG_DATA_HOME:-$HOME/.local/share}/local-ai-relay/source"
  npm run integrations:remove
  ```

- To apply the previewed cleanup:

  ```bash
  npm run integrations:remove -- --yes
  ```

## If something goes wrong

Start with **Check setup** and **Activity & errors** in the dashboard.

| Symptom | What to do |
|---|---|
| `bootstrap.sh: No such file or directory` | Do not run `bootstrap.sh`; use the complete source-preview command under **Install and open** |
| Git or Node is missing | Install Git and Node.js 22+, then rerun the same starter command |
| Dashboard did not open | Open the `Dashboard:` URL printed by the starter on the same computer |
| **Use this Chrome** cannot find the extension | Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the exact path shown by the dashboard |
| Provider opens in a separate browser | Pair the extension with **Use this Chrome**; otherwise the shared relay browser is the intentional fallback |
| No Chrome/Chromium is installed | Retry **Connect**; the relay automatically installs its managed Chromium fallback |
| Provider asks for sign-in | Finish sign-in in the visible official-provider tab; never paste cookies or passwords into the relay |
| CAPTCHA or verification loop | Complete it manually. The relay does not bypass provider safeguards |
| Provider reports quota or rate limit | Wait for its stated reset time or connect another provider |
| Harness is missing | Use the linked official install guide, install it, then refresh |

Local logs:

- Linux: `~/.local-ai-relay/relay.log`
- Windows: `%USERPROFILE%\.local-ai-relay\relay.log`

Rerunning the starter is safe: it updates the managed checkout, preserves
unexpected folders and local changes, and skips dependency installation when
the lockfile is unchanged.

## Privacy and current proof

- The API binds to `127.0.0.1` by default and requires authentication.
- Extension keys and harness keys are scoped and revocable.
- Provider passwords and cookies are never copied into relay configuration.
- Diagnostics stay local and may contain page content; disable screenshots with
  `RELAY_DIAGNOSTICS=0`.
- No remote telemetry is sent by Local AI Relay.
- Provider terms, quotas, access controls, and safety systems still apply.

Deterministic tests cover the server, dashboard, extension bridge, routing,
reversible harness configuration, launchers, delivery paths, and mock isolation.
Real provider readiness still requires a successful request in the operator's
own browser and region. A signed `v0.1.0` installer is not advertised until its
artifacts, checksums, and attestations exist on the
[Releases page](https://github.com/Nan0pk/local-ai-relay/releases).

## Developers

Normal operators can stop reading here.

```bash
git clone https://github.com/Nan0pk/local-ai-relay.git
cd local-ai-relay
npm ci
npm run verify
```

[Provider architecture](docs/providers.md) ·
[Browser connection details](docs/login-solution.md) ·
[OpenAPI](docs/openapi.json) ·
[Contributing](CONTRIBUTING.md)

### Non-interactive harness use and port repair

After a provider has been logged in and a real completion has succeeded, the relay
serves batch, non-interactive OpenAI-compatible requests at `/v1/chat/completions`
and `/v1/responses`. Login and CAPTCHA challenges remain interactive; they are not
silently bypassed. The dashboard **Connect** action performs a real completion
(`Reply with only: relay ready`) before writing a harness configuration, so a file
existing on disk is not treated as proof of readiness.

Relay-owned Hermes and OpenCode URLs follow the active relay port automatically,
including after safe runtime replacement. Only configurations previously created
by this relay, with a still-valid scoped token, are repaired; unrelated settings
are left alone and a timestamped backup is retained. To remove an integration and
revoke its key, use:

```bash
npm run integrations:remove -- --harness hermes
npm run integrations:remove -- --harness opencode
```

To reconfigure against the currently running relay, use `npm run hermes:configure`
or `npm run harnesses:configure`. Verify the result with one real request rather
than relying on dashboard status:

```bash
curl --fail-with-body "$RELAY_BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $RELAY_HARNESS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"model":"relay-auto","messages":[{"role":"user","content":"Reply with only: relay ready"}]}'
```
