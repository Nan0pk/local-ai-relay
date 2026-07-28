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
starts the loopback-only server, and opens the unlocked Control Center. It does
not modify a random clone or force a provider login during installation.

## Get to work

The Control Center is the normal interface. No project coding is required.

1. **Choose browser mode.** Click **Use this Chrome** if you want the relay to
   reuse logins already present in your normal Chrome profile. The dashboard
   gives the one-time extension installation path. Skip this step to use the
   isolated shared relay browser.
2. **Connect one provider.** Click **Connect / check access**. The relay first
   looks for a usable signed-out composer. If the provider asks for an account,
   sign in on the official page that opened. The card changes to **Ready** only
   after one transparent test request succeeds.
3. **Connect your harness.** Choose Hermes, OpenCode, or **Generic
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

Provider login rules vary by region, quota, rollout, and time. On 28 July 2026,
a signed-out composer was visible during a non-submitting audit for ChatGPT,
Gemini, Z.ai, Qwen, Meta AI, Kimi, Arena, MiniMax, and Grok. DeepSeek redirected
to sign-in. Claude and Mistral presented site verification to the audit browser,
so their signed-out state was inconclusive.

Those observations are only connection-order hints. The dashboard never treats
them as readiness evidence. It checks the page you actually receive and adapts:

- usable composer → verify immediately;
- login page → keep the official page open while you sign in;
- CAPTCHA or site verification → ask you to complete it manually;
- quota, rate limit, layout change, timeout, or interrupted generation → show
  the classified error and a link to its event log.

Provider sites can still change independently of this project.

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
