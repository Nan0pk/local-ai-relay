# Local AI Relay

**Use AI provider web chats from Hermes, OpenCode, or another
OpenAI-compatible app through one private local dashboard.**

[![CI](https://github.com/Nan0pk/local-ai-relay/actions/workflows/ci.yml/badge.svg)](https://github.com/Nan0pk/local-ai-relay/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-5ee6b0)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-5ee6b0)](#start-here)

> [!IMPORTANT]
> **Available now:** source preview for Linux x64 and Windows x64.
> **Not available yet:** a signed `v0.1.0` release. Do not use a versioned
> release command until that version is visible on the
> [Releases page](https://github.com/Nan0pk/local-ai-relay/releases).

## Start here

These commands work from any directory. They download the official starter,
install or safely update one managed source checkout, create **Local AI Relay**
in the application menu, and open the Control Center.

### Linux

Requires Git and Node.js 22 or newer.

```bash
curl -fsSL https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/start-source.sh -o /tmp/local-ai-relay-start.sh && bash /tmp/local-ai-relay-start.sh
```

### Windows PowerShell

Requires Git and 64-bit Node.js 22 or newer.

```powershell
$starter = Join-Path $env:TEMP 'local-ai-relay-start.ps1'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/Nan0pk/local-ai-relay/main/start-source.ps1' -OutFile $starter; powershell.exe -NoProfile -ExecutionPolicy Bypass -File $starter
```

Want to inspect the starters first?
[Linux](start-source.sh) · [Windows](start-source.ps1)

### What happens

1. The starter uses an isolated checkout under the current user's application
   data directory. It never overwrites an unrelated folder or local changes.
2. Dependencies install only on first start or when the lockfile changes.
3. An application-menu launcher is created for later starts.
4. The loopback-only relay starts and the authenticated Control Center opens.
5. No provider login is forced during installation.

If a prerequisite is missing, the starter stops immediately with the missing
item and leaves existing data untouched.

## Get working

In the Control Center:

1. **Connections:** click **Connect** beside a provider. If the provider
   requires an account, complete sign-in on its real website.
2. Wait for **Ready**. The relay performs one real verification; it does not
   call a provider ready merely because an adapter exists.
3. **Work:** connect Hermes, OpenCode, or copy the generic OpenAI-compatible
   settings. Launch the detected harness and select model `relay-auto`.

The dashboard shows relay health, provider connection stages, harness state,
routing mode, recent activity, setup checks, and linked error details.

## What is actually ready

| Area | Current status |
|---|---|
| Local server and Control Center | Deterministically tested |
| Production mock isolation | Deterministically tested; fake providers are not exposed |
| ChatGPT browser adapter | Implemented; readiness is verified on the user's own account |
| Claude, Gemini, DeepSeek, Z.ai, MiniMax, Kimi, Qwen, Grok, Mistral, Meta AI, Arena | Adapters exist; treat each as experimental until it passes a real request on the user's machine |
| Hermes and OpenCode configuration | Reversible configuration logic tested; installed harness and account still require local proof |
| Linux/Windows application launcher | Implemented; Windows execution is also checked in Windows CI |
| Signed installer release | **Not published yet** |

Provider websites, account eligibility, quotas, regional access, and anti-bot
checks can change independently of this repository. The dashboard reports the
observed state instead of promising universal availability.

## Sign-in and browser behavior

**Connect and sign in** opens the official provider chat in a dedicated,
persistent relay browser profile. Passwords, passkeys, 2FA, consent, and
CAPTCHAs are handled directly on the provider's page. Local AI Relay does not
ask for or store the account password.

The relay intentionally does **not** automate the everyday Chrome profile.
Sharing an active personal profile with automation risks browser locking,
profile corruption, and unnecessary cookie exposure.

No Chrome extension is required. The optional extension in this repository is
an experimental status companion; it does not carry prompts or provider
sessions.

## Provider status

- **Available / Sign in:** an adapter exists but has no current real evidence.
- **Connecting:** browser setup, login wait, or verification is running.
- **Ready:** a real response succeeded. Evidence remains current for seven days
  and refreshes after successful use.
- **Needs attention / Error:** open the linked activity entry for the exact
  classified failure and recovery action.

A connection attempt can be cancelled. CAPTCHA, login, quota, rate-limit,
layout-change, timeout, and interrupted-generation failures are reported
separately.

## Routing

Leave automatic routing on and use `relay-auto` for the simplest setup. It
routes only among selected providers with current readiness evidence.

Advanced controls allow:

- reliability-first or speed-first routing;
- an explicit provider priority;
- manual lock to one provider model;
- safe pre-submission fallback on or off.

The relay does not retry ambiguous timeouts or interrupted generations on a
different provider, which avoids accidentally submitting the same work twice.

## Harnesses

### Hermes

The dashboard detects `hermes` in `PATH`, adds one `local-ai-relay` provider to
`~/.hermes/config.yaml`, preserves unrelated settings, retains bounded backups,
and restores the prior model choice when disconnected.

If Hermes is missing, follow its
[official installation guide](https://hermes-agent.nousresearch.com/docs/getting-started/installation)
and refresh the dashboard.

### OpenCode

The dashboard detects `opencode` in `PATH` and adds only the
`local-ai-relay` provider entry to
`~/.config/opencode/opencode.json`.

If OpenCode is missing, follow its
[official installation guide](https://opencode.ai/docs/)
and refresh the dashboard.

### Another harness

Choose **Generic OpenAI-compatible client → Get settings**. The dashboard
provides:

- a loopback base URL such as `http://127.0.0.1:8787/v1`;
- a dedicated revocable API key;
- model `relay-auto`.

No unknown harness files are modified automatically.

## Stop, switch, or remove

- Connect several harnesses at once; each receives a separate revocable key.
- Click **Disconnect** beside one harness to remove only relay-owned settings.
- Use **Disconnect all** to remove all known harness integrations and revoke
  their keys without deleting provider browser profiles.
- Preview cleanup from a terminal:

  ```bash
  cd "${XDG_DATA_HOME:-$HOME/.local/share}/local-ai-relay/source"
  npm run integrations:remove
  ```

- Apply that cleanup:

  ```bash
  cd "${XDG_DATA_HOME:-$HOME/.local/share}/local-ai-relay/source"
  npm run integrations:remove -- --yes
  ```

To stop the background relay without removing configuration:

```bash
systemctl --user stop local-ai-relay.service
```

On Windows, use the dashboard cleanup controls and stop the Local AI Relay
process from the user session if it is still running.

## If something fails

1. Open **Setup doctor** in the dashboard.
2. Open the error link beside the affected provider or harness.
3. Check the local relay log:
   - Linux/macOS: `~/.local-ai-relay/relay.log`
   - Windows: `%USERPROFILE%\.local-ai-relay\relay.log`
4. Run the same start command again. The starter updates safely and skips
   dependency installation when nothing changed.

Common recoveries:

| Symptom | Action |
|---|---|
| Starter says Git or Node is missing | Install Git and Node.js 22+, then rerun the same command |
| Browser does not open | Copy the dashboard URL printed in the terminal into the same local machine's browser |
| Provider requests sign-in | Complete sign-in in the dedicated relay browser window |
| CAPTCHA or verification loop | Complete it manually; the relay does not bypass it |
| Provider shows quota/rate limit | Wait for the provider's stated recovery time or use another ready provider |
| Harness says not installed | Install the harness from its official guide, then refresh |
| Harness says installed but not connected | Click **Connect** after at least one real provider is Ready |

## Privacy and security

- The API binds to `127.0.0.1` by default and requires a bearer token.
- Provider profiles, tokens, prompts, and diagnostics stay local.
- Diagnostics are opt-in and redacted.
- No remote telemetry is sent by Local AI Relay.
- Provider terms, quotas, safety systems, and access controls still apply.

## Signed releases

A signed installer is intentionally not advertised as runnable until an actual
stable release exists. When one is published, the
[Releases page](https://github.com/Nan0pk/local-ai-relay/releases) will contain
the exact Linux and Windows bootstrap assets, checksums, attestations, and
versioned packages. The authenticated delivery design is documented in
[docs/release-policy.md](docs/release-policy.md).

## Developers and contributors

This is not required for normal use.

```bash
git clone https://github.com/Nan0pk/local-ai-relay.git
cd local-ai-relay
npm ci
npm run verify
```

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Provider behavior: [docs/providers.md](docs/providers.md)
- OpenAPI document: [docs/openapi.json](docs/openapi.json)
- Current productization task: [TASK.md](TASK.md)

Apache-2.0 licensed.
