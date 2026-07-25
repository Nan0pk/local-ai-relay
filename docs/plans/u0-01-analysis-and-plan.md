# U0-01 — Deep analysis, environment audit, and plan of work

**Author:** Arena agent session `arena/019f9ad5-local-ai-relay`
**Date:** 2026-07-25
**Base commit:** `d9a2582113f7b62b51b2f6ebe9ead4d87563f004` (`main`, PR #20 merge)
**Status of this document:** analysis + proposed plan. No production code changed yet.

---

## 1. Executive summary

Five findings drive everything below.

1. **The deterministic baseline in `TASK.md` is fully green on this checkout.**
   All eight acceptance commands pass. The repository is *not* broken; nothing
   needs repair before feature work.

2. **`TASK.md` (U0-01) cannot be completed in this sandbox.** It requires a
   live, manually authenticated ChatGPT session driven through a visible
   browser, plus a Hermes harness. This environment has **no Chrome/Chromium,
   no `DISPLAY`/Wayland session, no Hermes binary, and no network egress to
   `chatgpt.com`**. Section 3 documents the audit. The live half of U0-01 is
   maintainer-owned work on the Fedora box, and no amount of agent effort here
   changes that.

3. **U0-01 was already attempted and abandoned as PR #21, and I recovered it.**
   PR #21 ("fix: persist probe evidence safely") built ~828 lines of exactly
   the machinery U0-01 asks for — a `chatgpt-canary` runner, a persistent
   evidence store, and evidence docs — then was **closed with failing CI**.
   That work is not lost; it is fetchable at `refs/pull/21/head`.

4. **I found the precise reason PR #21's CI failed, and it is a one-line
   portability bug.** `ubuntu-latest` passed; `windows-latest` failed at
   `npm run npm test`. The cause is
   `src/capabilities/evidence-store.test.ts:36`:
   `assert.equal((await stat(path)).mode & 0o777, 0o600)`.
   Windows Node does not implement POSIX permission bits — it reports `0o666`
   (or `0o444` when read-only). The assertion can never hold on Windows. I
   verified PR #21's suite passes on Linux (**289 tests, 279 pass, 10
   Windows-skipped, 0 fail**) in a scratch worktree, isolating the failure to
   platform-specific assertions rather than logic.

5. **Therefore the highest-value work available now is to land PR #21's
   substance correctly, cross-platform, deterministically tested** — so that
   when the maintainer reaches a Fedora machine, U0-01's live half is a
   single command (`npm run live:chatgpt`) rather than a fresh engineering
   effort. That is the plan in Section 6.

**Recommended next action:** approve Workstream A (Section 6.1). It is
deterministic, CI-verifiable on both OSes here, and it is the critical path to
U0-01, U0-02, and U0-03.

---

## 2. What this project is

`local-ai-relay` is a local-first Fastify daemon exposing **one authenticated
loopback OpenAI-compatible API** that routes model IDs to browser-driven
consumer AI websites (via Patchright), so agent harnesses (Hermes, OpenCode)
can use already-paid/free web accounts without handing credentials to a hosted
proxy.

### Layer map (verified against source)

| Layer | Path | Role |
|---|---|---|
| HTTP surface | `src/routes/` | `/v1/responses` (295 LOC), `/v1/chat/completions` (194), `/v1/models`, `/health` |
| Auth | `src/auth/` | Bearer token at `~/.local-ai-relay/token`, CORS, unsafe-bind guard |
| Registry | `src/providers/registry.ts` (218) | Model ID → provider; readiness-gated discovery |
| Adapters | `src/providers/*-browser.ts` | OpenAI payload ↔ browser prompt, 13 providers |
| Prompt shaping | `conversation-planner.ts` (96), `tool-bridge.ts` (220) | Compact prompts, tool-call translation |
| Drivers | `src/browser/` | `base-driver.ts` (504) + 13 per-site drivers |
| Runtime | `src/browser/runtime.ts` | Patchright contexts, per-provider profiles, mock swap |
| Capability | `src/capabilities/tracker.ts` | 6-state readiness machine, **in-memory only** |
| Harness config | `src/hermes/`, `src/opencode/` | Idempotent config merge with `.bak` files |

Roughly **9,500 lines of TypeScript**, 14 registered models, 12+ browser
adapters, CI on Ubuntu + Windows.

### The governing philosophy

`docs/plans/use-first-completion-plan.md` is the authoritative execution order
and it is unusually disciplined. Its core rule, repeated in `AGENTS.md`,
`PROJECT.md`, and `docs/north-star.md`:

> **A compiled adapter is not a working provider.** Unit ≠ fixture ≠ mock E2E ≠
> live probe ≠ live E2E ≠ dogfood ≠ soak ≠ release evidence. These are never
> used interchangeably.

The project's central risk is *not* technical difficulty — it is **truth
drift**: 12 adapters exist, 0 have current live evidence. Every plan decision
below is subordinate to keeping that distinction honest.

---

## 3. Environment audit (what I equipped and what is missing)

### Available and working

| Capability | Detail |
|---|---|
| OS | Debian 12 (bookworm), kernel 6.1.158, x86_64 |
| Node | **v22.22.3** — satisfies `engines: >=22` |
| npm | 10.9.8 |
| Toolchain | git 2.39.5, **gh 2.23.0 (authenticated)**, python3.11, jq, ripgrep, curl, wget, gcc, make |
| Dependencies | `npm ci` → 58 packages, clean |
| TypeScript | 5.7.3 + tsx 4.19.2 via local `node_modules` |
| Resources | 2 vCPU, 3.8 GiB RAM, 20 GiB free |
| npm registry | reachable (HTTP 200) |

### Missing — and blocking for the live half of U0-01

| Missing | Probe result | Consequence |
|---|---|---|
| **Chrome / Chromium** | no `google-chrome*`, `chromium*`, `firefox` on PATH | `findSystemBrowser()` returns `undefined` |
| **Managed Chromium download** | `npx patchright install chromium` → `ECONNRESET` from `cdn.playwright.dev` | cannot self-provision a browser |
| **Graphical session** | `DISPLAY` and `WAYLAND_DISPLAY` both empty; no Xvfb | `live-probe.ts` throws by design: *"No graphical Linux session was detected"* |
| **Egress to providers** | `curl https://chatgpt.com` → `000`; `https://google.com` → `000` | no provider reachable even with a browser |
| **Hermes harness** | `hermes` not on PATH, no `~/.hermes` | Hermes round-trip missions cannot execute |
| **OpenCode** | not installed | OpenCode config path untestable live |
| **Fedora** | this is Debian 12 | `TASK.md` explicitly scopes the proof to Fedora |

**Conclusion:** six independent hard blockers stand between this sandbox and
U0-01's live acceptance criteria. This is an environment fact, not a fail-fast
retry candidate. Per `TASK.md`'s own fail-fast rule I am recording it with
exact evidence rather than redesigning around it or weakening readiness rules
to manufacture a pass.

### What *is* fully exercisable here

Everything deterministic — which is most of the engineering:
unit tests, mock-browser E2E (`RELAY_MOCK_BROWSER=true` swaps the Patchright
runtime for `src/browser/mock-browser.ts`), build, startup smoke, delivery
security tests, release validation, and **CI on both Ubuntu and Windows via
`gh`**. That last point matters: the exact gate PR #21 failed is one I can
verify before proposing a merge.

---

## 4. Baseline results (this commit, this machine)

Run in full before any edits, per `TASK.md`.

| # | Command | Result |
|---|---|---|
| 1 | `npm ci` | PASS — 58 packages, ~3 s |
| 2 | `npm run typecheck` | **PASS** — exit 0, no diagnostics |
| 3 | `npm test` | **PASS** — 278 tests, 268 pass, 10 skipped (Windows-only), **0 fail**, 14.6 s |
| 4 | `npm run test:e2e` | **PASS** — 62 tests, 62 pass, 0 fail, 113.7 s |
| 5 | `npm run build` | **PASS** — exit 0 |
| 6 | `npm run smoke:startup` | **PASS** — occupied-port startup selected 23775; `/health` + `/v1/chat/completions` responded |
| 7 | `npm run test:delivery` | **PASS** — 30 tests, 20 pass, 10 skipped, 0 fail |
| 8 | `node scripts/validate-release.mjs` | **PASS** — validated 8 deterministic authenticated release assets for v0.1.0 |

**The deterministic baseline is green.** Any regression introduced from here is
attributable to new work.

### Non-blocking observations

- `npm audit`: **2 high-severity advisories**, both transitive under Fastify 5
  (`fast-uri` host confusion; `find-my-way` HTTP/2 DoS). Loopback-only binding
  makes exploitability low, but they will surface in any U5-01 dependency
  review. Worth a bounded bump; **out of U0-01 scope**.
- `docs/e2e/chatgpt.md` **does not exist** on `main`, while nine other
  providers have evidence pages. ChatGPT — the one provider U0-01 is about —
  is the least documented. `TASK.md` item 8 names this file explicitly.
- `src/routes/health.ts` returns a hardcoded `version: '0.1.0'` duplicating
  `package.json`. Minor drift risk at U0-04 release time.

---

## 5. The PR #21 forensic finding (highest-leverage discovery)

### What happened

PR #21 was opened 2026-07-19 from `feat/v2-harness-product`, targeting exactly
U0-01's deliverables, and **closed without merging** after three consecutive
failing CI runs.

Its 16 changed files / +828 lines:

| File | + | Purpose |
|---|---:|---|
| `src/cli/chatgpt-canary.ts` | 422 | Full canary runner: spawns its own relay, isolated temp Hermes config, cold restart, 5 missions, sanitized evidence |
| `src/capabilities/evidence-store.ts` | 125 | Restart-durable evidence, atomic write, `0600`, inter-process lock, TTL |
| `src/capabilities/evidence-store.test.ts` | 90 | Persistence/expiry/malformed tests |
| `src/cli/chatgpt-canary.test.ts` | 51 | Pure-function tests (marker, SSE parse, version parse) |
| `src/cli/configure-harnesses.ts` | +19 | Fall back to compiled catalog when no relay is listening |
| `src/providers/*`, `registry.ts`, `health.ts`, `server.test.ts`, `README.md`, `docs/e2e/chatgpt.md`, `package.json` | ~120 | Wiring, `instance_id` for restart proof, `live:chatgpt` script |

### Why CI failed — confirmed, not guessed

```
ubuntu-latest  / Node 22 :: success
windows-latest / Node 22 :: failure  →  step "Run npm test"
```

`src/capabilities/evidence-store.test.ts:36`:

```ts
assert.equal((await stat(path)).mode & 0o777, 0o600);
```

Node on Windows does not implement POSIX mode bits. `fs.stat().mode` yields
`0o666` for a writable file and `0o444` for a read-only one; `0o600` is
unreachable. The assertion is **structurally impossible to satisfy on
Windows**, so every Windows CI run failed while Ubuntu passed.

I validated the complementary half in a scratch worktree of `refs/pull/21/head`:

```
# tests 289   # pass 279   # fail 0   # skipped 10   (Linux)
```

**The logic is sound; only the platform assertion is wrong.** This is a
~5-line fix (gate the mode assertion behind `process.platform !== 'win32'`,
and make the store's hardening intent explicit on Windows via ACL-agnostic
placement under the user profile rather than POSIX bits).

### Why this matters strategically

U0-01 is estimated at 0.5–1.5 days. Roughly **a full day of that work already
exists and is 95% correct.** Rebuilding it from scratch would be waste;
recovering it converts U0-01's deterministic half into a review-and-harden
exercise. This single finding is the strongest argument for the plan below.

### Design caveats to review, not adopt blindly

- **`worktreeFingerprint()`** hashes `git diff --binary HEAD` plus every
  untracked file. On a large or dirty tree this reads unbounded bytes into
  memory. Needs a size cap and exclusion of ignored paths.
- **Random port** `30000 + rand(10000)` risks collisions; prefer bind-to-`0`
  and read the assigned port, matching `src/startup/port-selection.ts`.
- **`isPersistable()` requires `providerId.startsWith('browser-')`**, silently
  refusing to persist anything else. Reasonable, but must be an explicit,
  tested contract rather than an implicit filter.
- The canary shells out to `git` and Hermes; each call needs a typed failure
  class so a missing harness reports `hermes_unavailable`, not a stack trace.

---

## 6. Plan of work

Three workstreams, ordered by value and by what this environment can actually
prove. **A is the recommendation.** B and C are maintainer-gated or optional.

### 6.1 Workstream A — Land the U0-01 deterministic half (recommended, do now)

**Goal:** every part of U0-01 that does not require a live account or a browser
is implemented, cross-platform, and green on Ubuntu *and* Windows CI — so the
maintainer's Fedora session is one command, not a project.

**Why now:** it is the critical path to U0-01, U0-02 (Windows reuses the same
fixtures by design), and U0-03. It is fully verifiable here. It recovers a
day of abandoned work. It carries no provider-policy or credential risk.

| Step | Work | Verification |
|---|---|---|
| A1 | Recover PR #21 onto this branch as a reviewed baseline (cherry-pick the 4 substantive commits `cd41378`, `be9f706`, `d5829fc`, `82bb433`), not a blind merge | `git log`, clean tree |
| A2 | **Fix the Windows blocker**: platform-gate the `0o600` assertion; assert restrictive perms on POSIX, assert correct parent-directory placement + non-world-readable intent on Windows | `npm test` green on both CI legs |
| A3 | Audit the whole recovered diff for other platform assumptions (path separators, `execFile` of `git`/browser, `/etc/os-release`, SIGTERM semantics — Windows has no real SIGTERM) | targeted unit tests |
| A4 | Harden `evidence-store.ts` per Section 5 caveats: bounded fingerprint, atomic write already OK, TTL explicit, lock timeout typed | new deterministic tests |
| A5 | Harden `chatgpt-canary.ts`: OS-assigned port, typed failure classes (`hermes_unavailable`, `browser_unavailable`, `no_display`, `login_required`, `captcha`, `rate_limited`, `quota_exhausted`, `timeout`), refuse to run and **exit non-zero with an actionable message** when preconditions are absent | run the canary *here* and confirm it fails fast and correctly with `browser_unavailable` / `no_display` — a genuinely useful negative test |
| A6 | Guarantee the readiness invariant: a successful one-turn probe reaches at most `reachable`; **only a full passing canary may promote to `ready`**; expired/malformed evidence never promotes | evidence-store + registry tests |
| A7 | Write `docs/e2e/chatgpt.md` with an explicit three-column truth table: **mock E2E (passing) / live Fedora (PENDING — owner) / Windows (PENDING — U0-02)**, plus the exact maintainer command sequence | review |
| A8 | README truth pass: state that no provider has current live evidence and that `live:chatgpt` is the only promoting command | review |
| A9 | Run the full 8-command baseline; push; **open a draft PR**; confirm green on `ubuntu-latest` *and* `windows-latest` via `gh run` | CI both legs |

**Explicitly out of scope for A:** new providers, the MV3 extension, the
Responses/MCP work, the dependency bumps, any readiness promotion.

**Definition of done:** draft PR open from `arena/019f9ad5-local-ai-relay`,
both CI legs green, ChatGPT still advertised as **not live-proven**, and a
handoff naming the exact maintainer commands for the live half.

**Risk:** low. Additive, behind a new CLI, no route/auth changes. The one real
risk — Windows CI — is precisely the failure I have already root-caused, and I
can observe both legs with `gh` before asking for review.

### 6.2 Workstream B — The live proof (maintainer-owned, blocked here)

Cannot start in this sandbox. Requires the Fedora box with Chrome, a graphical
session, provider egress, Hermes, and an authorized ChatGPT account.

Sequence once A is merged, on Fedora:

1. `npm ci && npm run build`
2. `npm run login:chatgpt` — **manual** sign-in, account choice, 2FA, CAPTCHA
3. `npm run probe:chatgpt` — expect one-turn marker pass → `reachable`
4. `npm run live:chatgpt` — probe, isolated Hermes config, single-turn,
   streaming, continuation, long prompt, compact tools, safe read-only tool
   round trip, one cold relay+browser restart, then 5 consecutive canaries
5. Confirm sanitized evidence under `~/.local-ai-relay/evidence/` contains
   **no** prompts, responses, cookies, tokens, or screenshots
6. Confirm `/v1/models` advertises `browser-chatgpt-free` **only** after step 4
   passes, and drops it when evidence expires

Fail-fast contract stands: max three bounded attempts per external failure
class, then stop with exact evidence and the smallest next action.

**Agent role during B:** none live. I can turn any reproduced failure into a
deterministic fixture, which is where the two-worker split in `TASK.md`
becomes legitimate — *after* a concrete failure exists, not before.

### 6.3 Workstream C — Bounded hygiene (optional, separate PR)

Do **not** fold into A; it would blur the U0-01 diff.

- Fastify transitive advisories (`fast-uri`, `find-my-way`) — 2 high
- `/health` version drift → read from `package.json`
- `.agents/` transcripts (20 files) are explicitly *not* current instructions
  per `AGENTS.md`; consider archiving to stop future agents mis-reading them
- `PROJECT.md`'s milestone table is superseded and self-contradictory; it
  already warns readers, but deletion is cleaner

---

## 7. Sequencing and dependencies

```
d9a2582 (green baseline, verified)
    │
    ├─ A: deterministic U0-01 half        ← recommended, startable now
    │      └─ draft PR, both CI legs green
    │            │
    │            ├─ B: live Fedora proof   ← maintainer, needs real machine
    │            │     └─ U0-02 Windows (reuses A's fixtures)
    │            │           └─ U0-03 dogfood → U0-04 v0.1.0
    │            │
    │            └─ (A's failure fixtures feed back into B's debugging)
    │
    └─ C: hygiene                          ← independent, separate PR
```

A and C are file-disjoint and could run in parallel; per the plan's
"parallelism must save work" rule, the honest call is **sequential** — the
overlap is not worth coordination overhead.

---

## 8. Truthfulness ledger

Stated plainly, because this project's dominant risk is overclaiming:

| Claim | Status |
|---|---|
| Deterministic baseline green at `d9a2582` | **Verified** — all 8 commands, output in §4 |
| PR #21 failed on Windows `npm test` | **Verified** — `gh run view 29688180782` job/step data |
| The `0o600` assertion is the cause | **Root-caused** — impossible on Windows Node; Ubuntu leg passed; Linux worktree run gave 289/0-fail |
| PR #21's logic works on Linux | **Verified** — scratch worktree, 279 pass / 0 fail |
| ChatGPT is live-ready | **NO.** No live evidence exists anywhere in this repo |
| Any browser provider is live-ready | **NO.** 12 adapters compile; that is all it means |
| U0-01 can complete in this sandbox | **NO.** Six hard blockers, §3 |
| Workstream A can complete here | **Yes** — fully deterministic, both CI legs observable |

---

## 9. Owner decisions required

1. **Approve Workstream A** — or redirect. This is the only decision needed to
   start.
2. **Schedule Workstream B** on the Fedora machine, with an explicitly
   authorized ChatGPT account, accepting provider-policy risk.
3. **Confirm the fallback semantics** PR #21 introduced in
   `configure-harnesses` (compiled catalog when no relay is listening). It
   improves setup ergonomics but means harness configs can list models the
   relay has never verified. My recommendation: **keep it**, but label unready
   entries in both Hermes and OpenCode output, consistent with the existing
   OpenCode labeling behavior.
4. **Workstream C timing** — now, or defer to U5-01's dependency review.

Nothing in A requires credentials, merges, releases, or provider access.
