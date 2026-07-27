# Release Notes — Local AI Relay

## v0.1.0 — Personal Alpha Release

> Personal alpha. ChatGPT-only live-proven. Browser automation is experimental and is not a provider-policy endorsement. Live-mission evidence is maintainer-attested and has not yet been independently reviewed.

### Features Included
- **OpenAI-Compatible Loopback Server:** Exposes `/v1/chat/completions` and `/v1/responses` endpoints.
- **ChatGPT Browser Driver:** Patchright-backed browser automation with isolated persistent profiles.
- **SQLite Idempotency Ledger v0:** Native WAL-mode `node:sqlite` database tracking request generations and preventing duplicate prompt submissions on cold restarts.
- **Centralized Retry Policy:** Max 3 attempts per failure class with 1s / 4s / 15s backoff and $\pm20\%$ jitter.
- **Deterministic Fault Injection Harness:** Validated 100% classification accuracy across challenge, quota, rate-limit, and network-cut DOM states.
- **Cross-Platform Verification:** Full baseline test suite passing on Linux x64 (`ubuntu-latest`) and Windows x64 (`windows-latest`).
