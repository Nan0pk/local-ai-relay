# Release Notes — Local AI Relay

## v0.4.0 — Multi-Provider Expansion Release

> Multi-Provider Expansion release. Expands supported browser provider adapters to 11 models: ChatGPT, Claude Web, Gemini Free, DeepSeek Free, Web Arena Free, Minimax, Qwen, Z.ai, Grok, Kimi, Mistral, and Meta AI.

### New Features & Enhancements
- **11-Provider Browser Pool:** Complete integration of 11 web browser provider adapters with capability tracker state management.
- **Unified Tool Schema Bridge:** Nonced tool schema injection and envelope parsing validated across all 11 providers.

---

## v0.3.0 — Web Arena & Model Router Release

> Web Arena & Heuristic Model Router release. Adds Web Arena provider adapter (`browser-arena-free`), blind pairwise prompt evaluation harness (`src/eval/arena-eval.ts`), heuristic model router (`src/router/model-router.ts`), and intelligent model aliases (`auto`, `fast`, `smart`).

---

## v0.2.0 — Beta Release (Multi-Provider & Sidecar)

> Stable-core Beta release. Adds secondary stable browser provider (Claude Web adapter), provider control CLI subcommands, global browser kill switch (`RELAY_BROWSER_KILL_SWITCH=1`), and Manifest V3 web extension sidecar.

---

## v0.1.0 — Personal Alpha Release

> Personal alpha. ChatGPT-only live-proven. Browser automation is experimental and is not a provider-policy endorsement. Live-mission evidence is maintainer-attested and has not yet been independently reviewed.
