# Release Notes — Local AI Relay

## v0.5.0 — General Availability (GA) Release

> Production-hardened General Availability release. Finalized multi-provider browser automation relay, sliding window rate limiter, provider control plane, Web Arena evaluation harness, heuristic model router, and Manifest V3 extension sidecar.

### Final Features Included
- **11 Web Browser Provider Adapters:** ChatGPT, Claude Web, Gemini Free, DeepSeek Free, Web Arena, Minimax, Qwen, Z.ai, Grok, Kimi, Mistral, and Meta AI.
- **Provider Control Plane & Kill Switch:** Dynamic CLI control (`status`, `disable`, `enable`, `clear-evidence`, `reprobe`) and global emergency kill switch (`RELAY_BROWSER_KILL_SWITCH=1`).
- **SQLite WAL-Mode Idempotency Ledger v0:** Native Node 22 `node:sqlite` transaction ledger guaranteeing zero duplicate prompt submissions across cold restarts.
- **Production Rate Limiting & Health Monitoring:** Sliding window request rate limiter (`src/middleware/rate-limit.ts`).
- **Manifest V3 Web Extension Sidecar:** Browser sidecar under `extension/` providing native tab loopback communication.
- **Heuristic Model Router & Pairwise Arena Eval:** Alias routing (`auto`, `fast`, `smart`) and automated pairwise evaluation (`src/eval/arena-eval.ts`).

---

## v0.4.0 — Multi-Provider Expansion Release

> Multi-Provider Expansion release. Expands supported browser provider adapters to 11 models.

---

## v0.3.0 — Web Arena & Model Router Release

> Web Arena & Heuristic Model Router release.

---

## v0.2.0 — Beta Release (Multi-Provider & Sidecar)

> Stable-core Beta release.

---

## v0.1.0 — Personal Alpha Release

> Personal alpha. ChatGPT-only live-proven.
