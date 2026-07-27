# Release Notes — Local AI Relay

## v0.3.0 — Web Arena & Model Router Release

> Web Arena & Heuristic Model Router release. Adds Web Arena provider adapter (`browser-arena-free`), blind pairwise prompt evaluation harness (`src/eval/arena-eval.ts`), heuristic model router (`src/router/model-router.ts`), and intelligent model aliases (`auto`, `fast`, `smart`).

### New Features & Enhancements
- **Web Arena Provider Adapter:** Integrates `browser-arena-free` provider model supporting dual-response evaluation.
- **Pairwise Evaluation Harness:** `src/eval/arena-eval.ts` CLI module executing automated blind pairwise prompt evaluation across browser adapters.
- **Heuristic Model Router:** `src/router/model-router.ts` selecting best available ready provider model based on capability readiness (`isReady`) and alias constraints (`auto`, `fast`, `smart`).

---

## v0.2.0 — Beta Release (Multi-Provider & Sidecar)

> Stable-core Beta release. Adds secondary stable browser provider (Claude Web adapter), provider control CLI subcommands, global browser kill switch (`RELAY_BROWSER_KILL_SWITCH=1`), and Manifest V3 web extension sidecar.

---

## v0.1.0 — Personal Alpha Release

> Personal alpha. ChatGPT-only live-proven. Browser automation is experimental and is not a provider-policy endorsement. Live-mission evidence is maintainer-attested and has not yet been independently reviewed.
