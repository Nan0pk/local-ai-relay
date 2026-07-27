# Release Notes — Local AI Relay

## v0.2.0 — Beta Release (Multi-Provider & Sidecar)

> Stable-core Beta release. Adds secondary stable browser provider (Claude Web adapter), provider control CLI subcommands, global browser kill switch (`RELAY_BROWSER_KILL_SWITCH=1`), and Manifest V3 web extension sidecar.

### New Features & Enhancements
- **Multi-Provider Architecture:** Full support for `browser-chatgpt` and `browser-claude-free` provider adapters.
- **Provider Control Plane:** Integrated CLI subcommands (`status`, `disable`, `enable`, `clear-evidence`, `reprobe`) for live operator control.
- **Global Kill Switch:** Immediate administrative disabling of browser providers via `RELAY_BROWSER_KILL_SWITCH=1`.
- **Manifest V3 Web Extension Sidecar:** Browser extension under `extension/` providing native tab loopback messaging.
- **Deterministic Fault-Injection Suite:** Local fixture server verifying 100% classification accuracy across challenge, quota, rate-limit, and network-cut DOM states.

---

## v0.1.0 — Personal Alpha Release

> Personal alpha. ChatGPT-only live-proven. Browser automation is experimental and is not a provider-policy endorsement. Live-mission evidence is maintainer-attested and has not yet been independently reviewed.

### Features Included
- **OpenAI-Compatible Loopback Server:** Exposes `/v1/chat/completions` and `/v1/responses` endpoints.
- **ChatGPT Browser Driver:** Patchright-backed browser automation with isolated persistent profiles.
- **SQLite Idempotency Ledger v0:** Native WAL-mode `node:sqlite` database tracking request generations and preventing duplicate prompt submissions on cold restarts.
- **Centralized Retry Policy:** Max 3 attempts per failure class with 1s / 4s / 15s backoff and $\pm20\%$ jitter.
