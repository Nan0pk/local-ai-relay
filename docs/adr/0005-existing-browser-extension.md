# ADR 0005: Existing-browser extension with shared-profile fallback

- Status: accepted
- Date: 2026-07-28

## Context

Launching a persistent automation profile is reliable but cannot reuse sessions
from an already-running everyday Chrome profile. Chrome profile locking makes
pointing Patchright at that live profile unsafe. The previous extension/native
host prototype carried status heartbeats only, required platform-specific host
installation, did not transport prompts, and was unsupported on Windows.

## Decision

Use a Manifest V3 extension as the primary existing-browser transport:

- pair from the loopback Control Center with a provisional scoped key;
- long-poll authenticated loopback bridge routes from the service worker;
- open and track relay-owned provider tabs in the current Chrome profile;
- run provider-specific, serializable composer and response contracts through
  `chrome.scripting`;
- never script identity-provider pages, unrelated tabs, or unlisted origins;
- revoke the scoped key on disconnect.

Keep Patchright as an automatic fallback, using one shared persistent relay
profile by default. If no compatible system browser exists, install managed
Chromium on first connection.

Provider authentication is dynamic. A visible usable composer wins regardless
of whether the user is signed in; otherwise the relay waits for manual login.

## Consequences

- Existing provider sessions can be reused without copying cookies.
- Extension installation is a one-time manual Chrome security step until a
  reviewed store package exists.
- Provider layout changes affect both transports but share one driver contract.
- OAuth and CAPTCHA decisions stay visible and manual.
- The native-host prototype and installer are removed, reducing unsupported
  platform-specific setup.
