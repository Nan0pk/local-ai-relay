# Shared Browser Profile & SSO Login

## How the shared browser profile works

`BrowserContextManager` (src/browser/context-manager.ts) is a singleton that
launches one persistent Patchright browser context per profile directory.
All providers that point at the same directory reuse the same context,
which means cookies, localStorage, and session state are shared.

The default shared profile path is:

```text
~/.local-ai-relay/browser-profiles/shared
```

Each driver accepts an optional `profileDir` or reads a provider-specific
environment variable:

| Provider | Env var to override profile dir |
|---|---|
| ChatGPT | `RELAY_BROWSER_PROFILE` |
| Claude | `RELAY_BROWSER_PROFILE_CLAUDE` |
| Gemini | `RELAY_BROWSER_PROFILE_GEMINI` |
| DeepSeek | `RELAY_BROWSER_PROFILE_DEEPSEEK` |
| Z.ai | `RELAY_BROWSER_PROFILE_ZAI` |
| MiniMax | `RELAY_BROWSER_PROFILE_MINIMAX` |
| Kimi | `RELAY_BROWSER_PROFILE_KIMI` |
| Qwen | `RELAY_BROWSER_PROFILE_QWEN` |
| Grok | `RELAY_BROWSER_PROFILE_GROK` |
| Mistral | `RELAY_BROWSER_PROFILE_MISTRAL` |
| Meta AI | `RELAY_BROWSER_PROFILE_META` |
| Arena | `RELAY_BROWSER_PROFILE_ARENA` |

To force every provider into the shared profile, export the variables
before starting the relay:

```bash
export RELAY_BROWSER_PROFILE=~/.local-ai-relay/browser-profiles/shared
export RELAY_BROWSER_PROFILE_CLAUDE=~/.local-ai-relay/browser-profiles/shared
export RELAY_BROWSER_PROFILE_GEMINI=~/.local-ai-relay/browser-profiles/shared
# ... etc for each provider
```

Because the context is persistent, a single login action survives relay
restarts as long as the profile directory is preserved.

## How Google SSO propagation reduces login friction

`BaseBrowserDriver.handleSsoLogin` (src/browser/base-driver.ts) runs
automatically on every page navigation. When it detects a login page, it
looks for:

- "Sign in with Google"
- "Continue with Google"
- Google-provider data attributes

If found, it clicks the SSO button. On `accounts.google.com` it also
auto-selects the first visible account. This means signing into Google
once in the shared profile can propagate to every provider that supports
Google SSO, without manual intervention for each site.

## Which providers support "Sign in with Google"

The relay auto-detects the button on any login page, so the exact list
depends on the provider's current UI. Providers that commonly offer
Google SSO include:

- **ChatGPT** — yes
- **Claude** — yes
- **Gemini** — yes (native Google account)
- **DeepSeek** — yes
- **Grok** — yes (X / Google options)
- **Mistral** — yes
- **Meta AI** — Meta/Facebook/Instagram account flow
- **Z.ai** — varies by region
- **MiniMax** — typically phone/email
- **Kimi** — typically phone/email
- **Qwen** — typically phone/email
- **Arena** — login-free

## Fallback instructions for providers that don't

If a provider does not show a Google SSO button, `handleSsoLogin` does
nothing and the normal login flow continues:

1. Run `npm run login:<provider>` (e.g., `npm run login:kimi`).
2. A browser window opens with the provider's site.
3. Sign in manually with the provider's native method (phone, email, etc.).
4. When the chat composer is visible, press `Ctrl+C` in the terminal to
   close the browser and save the session.
5. The persistent profile retains the session for future relay use.

If login fails or the session expires, repeat the steps above. No cookies
or tokens need to be copied manually.
