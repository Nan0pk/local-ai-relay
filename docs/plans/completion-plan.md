# Local AI Relay — Completion Plan

**Status:** proposed replacement for `use-first-completion-plan.md` and `v2-master-plan.md`
**Supersedes:** `use-first-completion-plan.md`, `v2-master-plan.md`, `click-to-work-productization.md`

## Context

**Purpose:** re-analyze the project against reality and cut the existing completion plan down
to something that ends in a polished product for personal daily use.

**The existing plan** is `docs/plans/use-first-completion-plan.md` (664 lines, authoritative
execution order) plus `docs/plans/v2-master-plan.md` (514 lines, architecture/threat model)
and `docs/roadmap.md`. It defines 7 phases (U0–U6), ~40 numbered tasks, and 12–16 weeks to a
public v1.0 with signed cross-platform releases, a Chrome Web Store extension, a native
messaging host, a 24-hour soak gate, a public beta cohort, and a conditional Rust rewrite.

**Why it needs replacing:** the plan's own structure produced the project's current state, and
its critical path is anchored on the wrong things. Evidence and specifics below. This document
replaces both plans as the execution order.

### Assumptions (unverified — I asked, got no answer)

| Assumption | Change it by |
|---|---|
| Audience is **you alone**, daily driver, no public release | Re-add Gate 5 (release engineering) if you want to ship it |
| Primary OS is **Linux** | Swap the Gate 2 platform target; Windows code stays, just stops being a gate |
| Primary client is **Claude Code + generic OpenAI clients** | Substitute Hermes/OpenCode in Gate 2.1 — they are already built |
| Anchor provider is **Gemini** | See Gate 1; the choice is defended below |

---

## Part 1 — What is actually wrong with the current plan

### 1.1 The plan's shape caused the failure it now polices

Git history shows branches `feat/u1-03-web-extension-sidecar`, `feat/u2-02-heuristic-model-router`,
`feat/u4-01-rate-limiting-monitoring`, `feat/u4-02-publish-v0.5.0-release`, and commits like
`docs(release): reconcile RELEASES.md for v0.5.0 General Availability (GA) release contract`.

Reality check on those "completions":

- `git tag -l` → **empty**. No release was ever cut.
- `package.json` version has **never left `0.1.0`**.
- `src/router/model-router.ts` — referenced by nothing except its own test. **Dead.**
- `src/middleware/rate-limit.ts` (`SlidingWindowRateLimiter`) — **never registered** in
  `src/server.ts:30-40`. **Dead.**
- `src/eval/arena-eval.ts` — referenced only by `src/providers/arena-eval.test.ts`. **Dead.**
- `src/ledger/sqlite-ledger.ts` — used only by `src/cli/chatgpt-canary.ts`, never in the
  request path. **Dead where it matters** — and `docs/mission-spec.md §3` bases its
  "No-Duplicate Assertion" on a ledger that no request ever writes to.

A numbered backlog with version labels attached to tasks rewards producing a file and marking
the task done. The plan's response was **more process**: `TASK.md` as single source of truth,
12 anti-endless-building rules, an 8-row evidence taxonomy, a model cost-tier table, a
"task advancement protocol". That is governance layered over a structural incentive problem.

**Fix: no numbered task backlog. Gates are satisfied by a recorded working demo, never by a
merged PR.**

### 1.2 It anchors the entire critical path on the hardest provider

Phase U0 is "Daily-use ChatGPT alpha" and *everything* depends on U0-01/U0-02
(`use-first-completion-plan.md:532-546`). But the repo's own signed-out audit
(`README.md:84-95`) records ChatGPT as: *"Composer appeared, but Send redirected to OpenAI
authentication/security verification."* ChatGPT is the most bot-hardened target in the fleet.

Gemini, Z.ai, and Qwen are the three that actually submitted a prompt and returned a response.

**Fix: anchor on what demonstrably works. Gemini first.**

### 1.3 A stated non-negotiable is violated in merged code, and nothing would catch it

`v2-master-plan.md:31` — *"Do not automatically choose a login account or submit credentials."*
`v2-master-plan.md:213` (P0-03, merged) — *"Disable first-account SSO selection."*

`src/browser/base-driver.ts:234-267` `handleSsoLogin()` auto-clicks
`button:has-text("Sign in with Google")`, `Continue with Google`, `[data-provider="google"]`.
It is wired to `framenavigated` on **every page in the context** (`:283-289`) and called from
`openForLogin` (`:206`), `waitUntilReady` (`:220`), and `assertNotBlocked` (`:426`).

The plan has no invariant test or lint rule that would have flagged this.

### 1.4 It never addresses the thing most likely to kill the product

The entire product is "scrape 12 chat websites". The plan's answer to selector drift is
U4-01 "provider conformance kit" — **week 10–14**. Meanwhile the actual mechanics are worse
than the plan assumes. From `src/browser/base-driver.ts`:

| Line | Problem | Consequence |
|---|---|---|
| `:510-542` `waitUntilStable` | Completion = **text unchanged for 2 s** (`stableMs`, `:151`). The stop-button guard only works if `stopButtonSelectors` still resolve; if they drift, `sawStop` stays `false` and there is no guard at all. | A reasoning model that pauses >2 s mid-answer gets **silently truncated**. Returns a *wrong answer*, not an error — the worst failure class. Untested. |
| `:497`, `:518` | `assertNotBlocked()` runs `page.locator('body').innerText()` + 3 regexes **every 250–300 ms** inside both polling loops | Full DOM text extraction several times a second for the whole request duration |
| `:316` | Session eviction takes `pages.entries().next().value` — **insertion-order FIFO, not LRU** | An active long conversation can be evicted while an idle one survives |
| `:401`, `:496`, `:517` | Cancellation only stops polling; the stop button is never clicked | Cancel doesn't cancel. Provider keeps generating and burns your quota |
| `:395` | `page.keyboard.insertText(request.prompt)` with no length handling | Oversized prompts fail opaquely or get truncated by the site |
| `:550` | Full-page screenshot on **every** failure unless `RELAY_DIAGNOSTICS=0` | Page content written to disk by default |

### 1.5 Tool calling is lossy in a way that breaks coding agents

`src/providers/tool-bridge.ts` implements tool use by injecting schemas as text and parsing a
`<relay_tool_calls>` block back out. It minifies via `truncate(description, 150)` for the
function and `truncate(description, 100)` per property (`:36-82`).

A coding agent's tool descriptions carry precise operational semantics. Silently cutting them
to 100 characters produces confidently wrong tool calls. Nothing in the plan tests this.

### 1.6 Nobody measured whether the use case is even viable

`SerialQueue` (`base-driver.ts:138`, `:185`) allows **one in-flight request per provider**. A
browser round trip is plausibly 10–30 s. A coding agent doing 20 sequential tool calls is
then 5–10 minutes of wall clock. There is **no latency budget anywhere in either plan**.

This is the cheapest thing to measure and the most likely to invalidate the whole premise, so
it goes first.

### 1.7 The one part that would definitely work is the one part never built

U2-02 (generic OpenAI-compatible upstream) and U2-03 (local Ollama/LM Studio adapter) are
deterministic, CI-testable, and immune to website changes. The plan schedules them at **week
4–6, behind three browser providers**. They do not exist today.

**Fix: build them early as insurance.** They make the relay never fully broken.

### 1.8 Scope is 5–10× what personal use needs

Signed reproducible builds, SBOM, attestations, Chrome Web Store publication, native-messaging
host installers for three OSes, a WXT rewrite of an extension that already works, a 24-hour
soak, a public beta cohort, and a conditional Rust rewrite — for one person on one machine.

---

## Part 2 — The replacement plan

Five gates. **A gate passes only when a recorded command produces a real answer** — not when a
PR merges. Estimates are focused engineering days.

### Kill criteria (the old plan has none)

- **After Gate 0.3:** if a simulated 10-turn agent loop exceeds ~5 minutes, the coding-agent
  use case is dead. Reposition as a one-shot query relay and skip Gate 2.2.
- **After Gate 1:** if completion detection cannot hit 20/20 on the *easiest* provider within
  4 days, DOM scraping is not reliable enough. Fall back to Gate 2.5 (local + official API
  upstreams) as the product, and demote browser providers to opportunistic extras.

---

### Gate 0 — Truth and subtraction · ~1 day

**0.1 Delete dead code.** Remove `src/router/`, `src/eval/`, `src/middleware/rate-limit.ts`,
`src/ledger/` and their tests. All are unreferenced by `src/server.ts`. Recoverable from git.
If per-request idempotency is wanted later, it belongs in `SerialQueue`, not a SQLite table.

**0.2 Close the SSO violation.** Make `handleSsoLogin` (`base-driver.ts:234-267`) opt-in behind
an explicit flag defaulting **off**, or delete it. Remove the `framenavigated` hook
(`:283-289`). Add a test asserting no automatic credential-surface click occurs by default.

**0.3 Measure the latency reality.** New `scripts/latency-baseline.ts`: 20 real completions
through the working provider, recording p50/p95 for page-ready, submit, first-text, and
completion — plus one simulated 10-turn agent loop. Commit the numbers. **This decides whether
Gate 2.2 is worth doing at all.**

**0.4 Collapse the docs.** 8 root `.md` + ~20 under `docs/`, several actively misleading:
`docs/agent-progress.md` is self-described as archived, `docs/mission-spec.md` asserts a ledger
that isn't wired, `RELEASES.md` describes phantom v0.2–v0.9 milestones. Keep `README.md`,
`docs/architecture.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/providers.md`, and this plan.
Move the rest to `docs/archive/`. Delete `TASK.md`, `PROJECT.md`, and `docs/agent-progress.md`.

**Gate:** `npm run verify` green with less code; latency numbers committed; one plan document.

---

### Gate 1 — One provider that genuinely works · 2–4 days

Target: **Gemini** (`src/providers/gemini-browser.ts`, `src/browser/gemini-driver.ts`).

**1.1 Replace completion detection — the core task.** Extend `SiteConfig`
(`base-driver.ts:26-61`) with a `completionSignals` contract and require at least one
*structural* signal before returning: stop-button appear→disappear transition, the
copy/regenerate action row rendering on the last message, or `aria-busy`/streaming-class
removal. Keep text-stability only as last resort, with a longer window — and when it is the
only signal available, set `x_relay.truncation_risk = true` on the response. **Never silently
return a possibly-truncated answer.**

**1.2 Selector drift self-test.** `npm run selftest:<provider>` opens the site and asserts every
configured selector class resolves. Wire it into startup discovery and into any
`layout_changed` failure path so the error names the exact broken class. This converts the
project's #1 ongoing maintenance cost from "mysterious failure" into a one-line diagnosis. The
old plan schedules the equivalent for week 10.

**1.3 Fix the polling hot loop.** Cache `body.innerText()` behind a ≥1 s floor in
`assertNotBlocked`; run the full block-detection scan on an interval or state change, not every
250 ms.

**1.4 Make cancellation real.** On abort, click the stop button before returning
(`base-driver.ts:401`, `:496`, `:517`).

**1.5 LRU session eviction** replacing insertion-order FIFO (`:315-318`).

**1.6 Prompt-size guard.** Measure Gemini's practical composer limit; exceed it → explicit
`prompt_too_large`, never a silent truncation.

**Gate:** 20 consecutive real completions, including one long prompt, one multi-turn, one
cancel that actually stops generation, one reasoning-style prompt with a >2 s mid-answer pause,
and one simulated selector break producing a correctly-named error. Output committed.

---

### Gate 2 — Daily driver through your real client · 2–3 days

**2.1 Wire your actual client.** Add Claude Code as a first-class harness beside Hermes and
OpenCode in `src/harness/manager.ts` — base URL + scoped key + `relay-auto`, with the same
backup/reverse semantics the existing integrations already have.

**2.2 Fix tool calling** *(skip if Gate 0.3 killed the agent-loop use case)*. Stop truncating
descriptions in `tool-bridge.ts:36-82`. Budget the tool block against the measured composer
limit; when over budget drop **whole tools** and say which — never mangle a schema in place.
Add an adversarial test using 12 realistic coding-agent tool schemas.

**2.3 Prove one real agent task** end to end — read a file, make a one-line edit — through your
client, against Gemini.

**2.4 Autostart and restart survival** on Linux only. `src/service/`, `src/startup/`. Windows
code stays in the tree but stops being a gate.

**2.5 Build the insurance policy** — generic OpenAI-compatible upstream + local model server
(Ollama / LM Studio) adapter, behind the existing provider registry contract
(`src/providers/registry.ts`). ~1 day, fully deterministic, CI-testable. This is old-plan
U2-02/U2-03 pulled forward from week 4–6, and it means the relay is never entirely broken when
a website changes.

**Gate:** you use it for a real task without editing source, and it survives a reboot.

---

### Gate 3 — Resilience for unattended use · 2–3 days

- **3.1** Surface the failure taxonomy to clients as OpenAI-shaped errors carrying
  `x_relay.failure_class` and a log pointer.
- **3.2** Browser/context crash detection and relaunch (`src/browser/context-manager.ts`).
- **3.3** Diagnostics: default screenshots **off** (currently on, `base-driver.ts:545`), redact,
  bound retention.
- **3.4** Health endpoint reflecting selector self-test status and last-success age per provider.
- **3.5** Per-provider kill switch reachable from the dashboard.

**Gate:** a week of real use; every failure you hit is self-explanatory from the dashboard.

---

### Gate 4 — Breadth, only after 1–3 hold · opportunistic

Generalize the Gate 1 completion + self-test contract into `BaseBrowserDriver`, then migrate
**Z.ai** and **Qwen** — the other two the audit says work. One provider at a time, each must
pass the Gate 1 bar.

Everything else becomes a **backlog, not a plan**: ChatGPT, Claude, the remaining seven
providers, the MV3 store listing, signed releases, Windows parity, MCP expansion, Rust. Pull
from it when you personally need something.

---

## Part 3 — Explicitly deleted from the old plan

| Old item | Why it goes |
|---|---|
| U0-04 signed v0.1.0, SBOM, attestations, provenance | No distribution → no supply chain to secure |
| U3-07 WXT MV3 rewrite | An MV3 extension already works (`extension/`) |
| U3-08 native messaging host + 3-OS installers | The HTTP poll bridge already works |
| U5-01 reproducible builds, CodeQL, OS support matrix | Public-release machinery |
| U5-02 24-hour soak, chaos gates | Gate 3's week of real use is the honest version |
| U5-04 public beta cohort | No public |
| U6 Rust benchmark and decision | Premature by the old plan's own admission |
| U4 provider fleet as a **gate** | Becomes opportunistic backlog |
| Windows parity as a **gate** | Code stays; verification burden halves |
| Evidence taxonomy, model cost-tier table, task advancement protocol | Process compensating for a bad plan shape |

**Net:** ~12–16 weeks → **~8–11 focused days to a daily driver**, with two explicit kill points.

---

## Part 4 — Verification

Per gate, in order:

```bash
npm ci
npm run verify          # audit, typecheck, unit, e2e, build, startup smoke, delivery, release contract
```

Then the gate-specific proof, which is the part that actually counts:

- **Gate 0** — `node --import tsx scripts/latency-baseline.ts` writes committed p50/p95 numbers;
  `git grep -l "model-router\|sqlite-ledger\|arena-eval\|rate-limit"` returns only history.
- **Gate 1** — `npm run selftest:gemini` passes; a 20-run canary script reports 20/20 with the
  five required cases; deliberately break one selector in `gemini-driver.ts` and confirm the
  error names that selector class.
- **Gate 2** — from your client, with the relay running:
  ```bash
  curl --fail-with-body "$RELAY_BASE_URL/v1/chat/completions" \
    -H "Authorization: Bearer $RELAY_HARNESS_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"model":"relay-auto","messages":[{"role":"user","content":"Reply with only: relay ready"}]}'
  ```
  then a real file-edit task through Claude Code; then `reboot` and repeat without touching source.
- **Gate 3** — kill Chrome mid-request and confirm recovery; force a quota error and confirm the
  dashboard explains it; confirm no screenshots on disk by default.
- **Gate 4** — Gate 1's bar, per provider.

---

## Part 5 — Files this touches

**Deleted:** `src/router/`, `src/eval/`, `src/ledger/`, `src/middleware/rate-limit.ts`,
`TASK.md`, `PROJECT.md`, `docs/agent-progress.md`, `docs/plans/*` (superseded by this file).

**Core edits:** `src/browser/base-driver.ts` (completion signals, polling, cancel, LRU, SSO),
`src/browser/gemini-driver.ts`, `src/providers/tool-bridge.ts`, `src/harness/manager.ts`,
`src/providers/registry.ts`, `src/control/doctor.ts`, `src/ui/assets.ts`.

**New:** `scripts/latency-baseline.ts`, `src/cli/selftest.ts`, a local/OpenAI upstream adapter
under `src/providers/`.

**Reused, not rebuilt:** `src/capabilities/` (evidence + TTL already does what Gate 3.4 needs),
`src/control/events.ts`, `src/auth/harness-tokens.ts`, `src/harness/manager.ts` backup/reverse
logic, `scripts/verify.mjs`, `src/browser/mock-browser.ts` (keep — it makes CI deterministic;
it just must stop being mistaken for provider evidence).
