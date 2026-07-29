# Browser connection and sign-in

Local AI Relay has two browser transports. Selection is automatic for each
connection and request.

## 1. Existing Chrome profile

This is the low-friction path:

1. Start the relay and open its Control Center.
2. Open `chrome://extensions`, enable **Developer mode**, and choose
   **Load unpacked**.
3. Select the extension directory shown in the Control Center.
4. Return to the dashboard and click **Use this Chrome**.

The dashboard sends a provisional, browser-extension-only key to its own
same-origin content script. The extension confirms receipt before the relay
activates the key and revokes older extension keys.

For each provider, the extension creates and remembers one relay-owned tab. It
uses that tab for composer detection, prompt submission, completion detection,
and response extraction. It does not search for or take over an unrelated
personal tab, copy cookies, or inspect domains outside the manifest allowlist.

Identity-provider pages are intentionally outside the scripting permissions.
If a provider redirects to Google, Apple, Microsoft, or another identity
service, complete that step manually. The relay waits for the provider tab to
return and become inspectable.

Click **Disconnect this Chrome** in the dashboard or **Forget relay** in the
extension popup to remove the local pairing and revoke the scoped key.

## 2. Shared relay-browser fallback

If the extension is absent or offline, provider drivers use Patchright with one
persistent shared profile:

```text
~/.local-ai-relay/browser-profiles/shared
```

All providers use that directory by default, so a Google or provider session
established there can be reused across providers and relay restarts. This is not
the everyday Chrome profile; Chrome prevents safely attaching a second process
to an already-running profile.

If installed Chrome or Chromium is unavailable, the first connection
automatically installs managed Chromium. Set `RELAY_BROWSER_EXECUTABLE` only
when automatic browser detection chooses the wrong executable.

`RELAY_BROWSER_PROFILE_SHARED` changes the shared fallback directory.
Provider-specific profile variables remain available for deliberate isolation
and take precedence over the shared setting.

Manual connection/sign-in is visible. Automatic startup discovery is headless
and does not click SSO controls; providers are checked sequentially so startup
does not create a window or tab storm.

## Dynamic access detection

The relay does not permanently classify a provider as “login-free” or “login
required.” A connection attempt opens the current official page and checks:

1. whether a visible composer exists and is usable;
2. whether the current URL or visible controls indicate sign-in;
3. whether a visible CAPTCHA, quota message, or rate-limit message blocks use;
4. whether the current selectors still match the provider layout.

When the dashboard opens, providers with a recently completed signed-out prompt
(currently Gemini, Z.ai, and Qwen) are checked automatically.
If the composer is already usable, anonymous or existing-session access
continues without forcing login. Otherwise the card classifies the blocker and
waits for an explicit manual connection; startup never clicks an SSO control.
Readiness is recorded only after a real, transparent verification message is
submitted and the expected response is extracted.

## Security boundaries

- Relay and extension traffic is loopback-only and bearer authenticated.
- The extension key cannot call model, routing, harness, pairing, or general
  control endpoints.
- An unrecognized Chrome extension origin is accepted only on the narrow
  browser-bridge routes and still requires the scoped key.
- Provider credentials, cookies, passkeys, 2FA answers, and CAPTCHA answers are
  never requested by Local AI Relay.
- Closing a relay request never closes the user's Chrome window or signs out a
  provider.
