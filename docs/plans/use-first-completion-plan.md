# local-ai-relay — Use-First Completion Plan

**Status:** authoritative execution order  
**Updated:** 2026-07-19  
**Primary objective:** put a useful relay in the maintainer's hands quickly,
then expand it without turning the project into permanent architecture work.

This plan governs **what happens next and in what order**. The existing
`v2-master-plan.md` remains the architecture and threat-model reference. When
the two documents disagree about execution order, this use-first plan wins.
`TASK.md` remains the only assignment a coding agent may execute at any moment.

## 1. End state

The project is complete when a user can install a signed release on supported
Linux and Windows systems, connect an OpenAI-compatible harness, explicitly
choose a backend, and use:

1. official API backends;
2. configured local model servers;
3. explicitly authorized experimental browser adapters;
4. Chat Completions, Responses, and an optional MCP control plane;
5. streaming, cancellation, restart recovery, bounded diagnostics, updates,
   and rollback without silent model or account substitution.

Browser adapters remain experimental even at v1.0. "Complete" means their
limits and evidence are truthful, not that consumer websites stop changing.

## 2. Honest starting point

### Completed

- P0-01 through P0-05 are merged.
- The relay has a Fastify/OpenAI-compatible chat-completions endpoint, bearer
  authentication, capability tracking, Patchright drivers, Hermes setup,
  deterministic tests, and authenticated release-delivery machinery.
- CI runs on Ubuntu and Windows. The current merged baseline passed 274 unit
  tests, 62 mock E2E cases, delivery-security tests, build, and startup smoke.
- Twelve browser adapters are implemented and registered.

### Not yet proven

- A fresh authenticated ChatGPT E2E run on the current Patchright commit.
- Daily Hermes use on both Fedora and Windows after restart and recovery.
- Current live evidence for the other browser adapters. Mock E2E is not live
  provider evidence.
- A published authenticated stable release.
- Official/local adapters, Responses API, MCP, the extension transport, durable
  session recovery, provider conformance, and public-beta reliability.

### Progress interpretation

Five of the old plan's 33 tasks are complete, but task count is not product
value. The existing v1 core makes the project much closer to a one-provider
personal alpha than to the full v2 end state. The next work therefore proves
and ships the smallest useful product instead of continuing the old numerical
sequence.

## 3. Rules that prevent endless building

1. **Use before expansion.** No fourth live backend until the three-provider
   personal beta is used successfully.
2. **One current task.** Only `TASK.md` authorizes work. Completing a PR without
   advancing `TASK.md` is an incomplete handoff.
3. **One branch and one draft PR per task.** No agent bus, competing PRs, or
   speculative milestone branches.
4. **Fail fast.** Reproduce the target path before refactoring. After three
   failed attempts at the same external blocker, record it, choose a bounded
   fallback, or defer the provider.
5. **Timebox provider work.** One focused engineering day per new browser
   adapter before deferral unless the maintainer explicitly extends it.
6. **Evidence has names.** Unit, fixture, mock E2E, live E2E, dogfood, soak, and
   release evidence are never used interchangeably.
7. **No fake readiness.** A compiled adapter starts `installed`, not `ready`.
   Stale or invalid live evidence cannot support a current readiness claim.
8. **No premature rewrite.** TypeScript remains the implementation until
   measured release workloads exceed written thresholds.
9. **No premature extension.** The MV3 transport starts only after the
   Patchright ChatGPT alpha is useful enough to justify migration.
10. **Parallelism must save work.** Use at most three workers plus one
    coordinator, only for independent paths defined in `TASK.md`.
11. **User actions are narrow.** The maintainer handles login, 2FA, CAPTCHA,
    account choice, provider-policy approval, release approval, and merge.
12. **Stop once the gate passes.** Nice-to-have cleanup goes to later backlog;
    it does not extend the active task.

## 4. Delivery ladder and realistic ranges

These are focused engineering ranges, not calendar promises. Live UI changes,
manual account access, and provider policy can extend them.

| Stage | User-visible result | Focused effort | Cumulative target |
|---|---|---:|---:|
| U0 — Daily-use alpha | ChatGPT through Hermes on Fedora and Windows; v0.1.0 | 3–7 days | within 1 week |
| U1 — Personal beta | ChatGPT, Claude, Gemini with shared recovery; v0.2.0 | 5–10 days | 2–3 weeks |
| U2 — Stable backends | Official API + local server + Responses + MCP; v0.3.0 | 8–15 days | 4–6 weeks |
| U3 — Extension beta | Visible-tab MV3 transport with one live provider; v0.4.0 | 15–25 days | 7–10 weeks |
| U4 — Provider fleet | Remaining providers individually proven or explicitly deferred | 10–25 days | 10–14 weeks |
| U5 — Public v1.0 | Scoped beta, soak/load gates, supportable release | 10–15 days | 12–16 weeks |
| U6 — Optimization | Measure TypeScript; Rust only if thresholds fail | 2–10 days | conditional |

The project becomes useful at U0. Work after U0 improves coverage and
maintainability; it must not be presented as a prerequisite for personal use.

## 5. Phase U0 — Daily-use ChatGPT alpha

**Outcome:** the maintainer can use ChatGPT through Hermes today, not merely run
mock tests.

### U0-01 — Fresh Fedora ChatGPT proof

**Depends on:** P0-05.  
**Estimate:** 0.5–1.5 days.  
**Current task:** yes.

Deliver:

- reproduce the complete deterministic baseline;
- run the front-page development setup on Fedora, using Node 22 and current
  stable Chrome/Patchright;
- make manual login/account selection explicit and preserve the dedicated
  profile;
- pass a fresh `probe:chatgpt` on the exact relay commit;
- prove Hermes to relay to ChatGPT to Hermes for normal response, compatibility
  streaming, continuation, long prompt, compact tools, and one safe read-only
  tool round trip;
- restart the service/browser and prove the next request does not duplicate or
  lose conversation state;
- record sanitized evidence containing environment, versions, commit, test IDs,
  timestamps, timings, and failure classification—never prompts, responses,
  cookies, tokens, or screenshots with user data;
- add or repair only the automation needed to repeat this canary cheaply.

Accept when five consecutive canary missions pass after a cold restart and the
provider is advertised only from fresh runtime evidence. If provider UI or
policy blocks the run after three bounded attempts, stop with exact evidence;
do not redesign the architecture to hide the blocker.

### U0-02 — Windows ChatGPT proof

**Depends on:** U0-01.  
**Estimate:** 0.5–1.5 days.

Repeat the same live canary on Windows x64 with Node 22 and installed Chrome.
Exercise PowerShell setup, service start/stop, profile reuse, port conflict,
restart, and Hermes configuration backup. Reuse U0-01 fixtures and test logic;
do not fork a separate behavioral contract.

Accept when five consecutive missions pass, including one managed-runtime
restart, and Windows-specific failures have structured actionable errors.

### U0-03 — Seven-day personal dogfood gate

**Depends on:** U0-01 and U0-02.  
**Estimate:** 1–3 engineering days spread across up to seven calendar days.

Run at least 20 real missions across the two systems, including:

- short and long prompts;
- multi-turn continuation;
- streaming client consumption;
- a safe tool proposal and execution through Hermes;
- browser/service restart;
- one logged-out or expired-session recovery;
- quota/rate-limit classification when naturally encountered;
- clean cancellation and retry without duplicate submission.

Track only aggregate result, latency, failure class, recovery action, platform,
and commit. Fix P0/P1 reliability defects encountered in the real path. Do not
add providers during this gate.

Accept at 95% mission success excluding explicit provider quota, challenge, or
network outages, with no silent fallback, wrong-account selection, secret leak,
or duplicate tool execution.

### U0-04 — Publish authenticated v0.1.0 alpha

**Depends on:** U0-03.  
**Estimate:** 0.5–1 day plus maintainer approval.

- reconcile the package version and exact stable tag;
- run the release workflow from the tagged SHA;
- publish Linux x64 and Windows x64 artifacts, manifest, SHA256SUMS,
  attestations/provenance, verifier, bootstrap files, and SPDX SBOM;
- install the published artifacts on clean test locations on both systems;
- prove update/rollback between two authenticated test versions when feasible;
- publish concise install, login, use, recovery, and uninstall instructions;
- label the release `personal alpha`, ChatGPT-only live-proven, experimental,
  and not a provider-policy endorsement.

**U0 exit gate:** the maintainer can install and use the alpha without editing
source. After this gate, normal project work must use the release for dogfood.

## 6. Phase U1 — Three-provider personal beta

**Outcome:** ChatGPT, Claude, and Gemini cover most high-value personal use while
sharing one reliability contract.

### U1-01 — Evidence expiry and readiness hardening

**Depends on:** U0-04.  
**Estimate:** 1–2 days.

- define evidence TTL and invalidation triggers for adapter, browser, model,
  provider surface, and relay changes;
- remove stale providers from default discovery or mark them unavailable;
- persist only bounded non-secret evidence metadata;
- add operator commands for status, reprobe, disable, and evidence clearing;
- test logged-out, disconnected, quota, challenge, stale, degraded, and disabled
  states.

Accept when `/v1/models` never advertises a provider without valid usable
evidence and diagnostic endpoints explain every exclusion.

### U1-02 — Shared browser lifecycle and recovery

**Depends on:** U1-01.  
**Estimate:** 2–3 days.

Extract only behavior proven common by the ChatGPT dogfood failures:

- dedicated profile ownership and lock handling;
- page/context crash recovery;
- login, logout, challenge, quota, composer, generation, timeout, and
  cancellation classification;
- bounded redacted diagnostics;
- session inspection and explicit reset;
- no automatic account choice.

Accept through contract tests and an unchanged ChatGPT live canary.

### U1-03 — Claude live adapter

**Depends on:** U1-02.  
**Estimate:** maximum one focused day before deferral.

Run login, single/multi-turn, streaming observation, long prompt, safe tool
proposal, cancellation, restart, and failure classification. Fix only
Claude-specific selectors/semantics in its driver; shared behavior belongs in
the lifecycle layer. Require fresh sanitized live evidence on at least one OS.

### U1-04 — Gemini live adapter

**Depends on:** U1-02.  
**Estimate:** maximum one focused day before deferral.

Use the same conformance cases as Claude. Manual Google account choice is
mandatory. A successful login alone is not readiness. Defer rather than bypass
provider challenges or account controls.

### U1-05 — Multi-provider dogfood and v0.2.0

**Depends on:** U1-03 and U1-04, or explicit documented deferral.  
**Estimate:** 2–3 days.

- run 30 missions split across live-ready providers;
- prove explicit model switching without conversation/account leakage;
- confirm no silent fallback and truthful `/v1/models` behavior;
- measure first observed text, completion latency, failures, and recovery;
- publish v0.2.0 with a current evidence matrix.

**U1 exit gate:** three providers are useful, or blocked providers are truthfully
deferred while ChatGPT remains stable. Do not hold the release hostage to an
external provider indefinitely.

## 7. Phase U2 — Stable API/local backends and standard interfaces

**Outcome:** the relay remains useful even when browser UIs break.

### U2-01 — Capability-aware backend selection

Define explicit backend identity, model identity, transport, credentials source,
health, and selection metadata. Reject ambiguous model IDs and silent
substitution. Add deterministic routing and error-shape tests.

### U2-02 — Generic official OpenAI-compatible upstream

Add configured base URL, key from environment/keychain integration boundary,
model allowlist, streaming, errors, timeouts, cancellation, and usage metadata.
Never log credentials or request/response bodies by default.

### U2-03 — Local model-server adapter

Support an explicit OpenAI-compatible local endpoint, covering Ollama, LM
Studio, llama.cpp, or compatible servers through one contract rather than
vendor-specific forks. Test with a deterministic local stub; perform one real
LM Studio or Ollama canary when available.

### U2-04 — Responses API

Implement `/v1/responses` request/response mapping, streaming events,
conversation/input mapping, tool proposals, errors, and compatibility tests.
Keep Chat Completions supported.

### U2-05 — MCP control plane

Add a separate `mcp` process mode for status, model discovery, login/probe
requests, reset/cancel, and diagnostics handles. Do not send bulk model traffic
through MCP and do not mix its stdio framing with Native Messaging.

### U2-06 — Cancellation, backpressure, and privacy-safe observability

Add bounded concurrency, deadlines, cancellation propagation, request IDs,
structured metrics, bounded logs, and slow-consumer behavior. No prompt content
or secrets in default telemetry.

### U2-07 — Publish v0.3.0 stable-backend beta

Run conformance across official, local, and ChatGPT backends. Document exact
backend selection and failure behavior. Publish an authenticated release.

**U2 estimate:** 8–15 focused days.  
**U2 exit gate:** at least one stable API/local path works independently of all
browser adapters.

## 8. Phase U3 — Visible-tab extension transport

**Outcome:** a user-authorized visible browser tab becomes the preferred
experimental webchat transport; Patchright remains recovery compatibility.

### U3-01 — Accept hybrid ADR and threat model

Freeze trust boundaries, extension permissions, Native Messaging identity,
local IPC, WebSocket development fallback, CSP, update policy, remote-data
limits, and explicit non-goals. Require independent security review.

### U3-02 — Extract `BrowserTransport`

Define probe, login, start/resume session, send turn, event stream, cancel,
reset, and diagnostics interfaces. Wrap Patchright without changing behavior.
Pass transport contract tests and the live ChatGPT canary.

### U3-03 — Versioned bridge protocol and chunking

Define schema and generated types for hello, capabilities, ack, append, replace,
snapshot, final, error, cancel, heartbeat, and resume. Implement bounded
multipart frames, hashes, sequence handling, timeouts, quotas, and malicious
input tests.

### U3-04 — Durable request/session state

Use SQLite for request/job metadata, capability evidence, session generations,
idempotency keys, and recovery state. Do not persist prompts by default. Prove
daemon/browser/tab/worker restart behavior and no blind prompt resubmission.

### U3-05 — Streaming reconciler

Build a pure snapshot-to-event reconciler supporting append, replace, snapshot,
and authoritative final. Test rerender, virtualization, reasoning sections,
pauses, duplicate mutations, cancellation, and final hash reconciliation.

### U3-06 — Scheduler and idempotent cancellation

Bound global and per-provider concurrency, slow consumers, deadlines, retries,
and cancellation. Prove no duplicate prompt or tool execution under restart.

### U3-07 — WXT MV3 workspace

Create a TypeScript/WXT extension with the narrowest host permissions, bundled
imperative logic, no cookie permission, CSP-safe content scripts, and explicit
tab authorization.

### U3-08 — Native host and authenticated local IPC

Implement separate `native-host` process mode, framed stdio, daemon connection,
allowed extension origin, user-level manifest installation, and OS-specific
setup/rollback.

### U3-09 — Worker rebind and tab generations

After service-worker restart, rediscover the authorized tab, resume observation,
reconcile state, and never resubmit solely because the worker restarted.

### U3-10 — Mock extension E2E

Prove install, authorize, send, stream, cancel, worker restart, browser restart,
large multipart payload, malicious frame, and diagnostics through a mock page on
Linux and Windows CI where supported.

### U3-11 — One live extension adapter

Use ChatGPT only. Require manual login, five consecutive missions, restart,
cancellation, long payload, and tool proposal. Patchright must remain available
as an explicitly selected fallback, never a silent substitute.

### U3-12 — Extension security review and v0.4.0

Review permissions, CSP, origin binding, IPC, protocol validation, diagnostics,
update path, and compromised-page behavior. Resolve high-severity findings,
document residual risk, and publish authenticated v0.4.0.

**U3 estimate:** 15–25 focused days.  
**U3 exit gate:** the extension vertical slice works through one live provider
and survives worker restart without duplicate submission.

## 9. Phase U4 — Provider fleet rollout

**Outcome:** every advertised browser provider is individually useful and
maintainable, or explicitly deferred/disabled.

### U4-01 — Provider conformance kit

Create reusable fixtures and live-canary definitions for login state, composer,
send, response selection, completion, UI-observed streaming, multi-turn,
cancellation, challenge, quota, logout, layout change, diagnostics, and evidence
expiry. Mock fixtures prove parser/driver behavior; live canaries prove current
provider usability.

### U4-02 — Rollout order

Each provider gets its own bounded task and PR. Priority may change with access
and provider policy, but the default value order after ChatGPT/Claude/Gemini is:

1. DeepSeek;
2. Kimi;
3. Qwen;
4. Z.ai/GLM;
5. MiniMax;
6. Grok;
7. Mistral;
8. Meta AI;
9. Arena.

For every provider:

- review applicable current provider policy and record an owner gate;
- perform manual login/account choice without bypass;
- pass the conformance kit and five consecutive live missions;
- record model, transport, commit, extension version, browser, OS, timestamp,
  test ID, evidence path, and expiry trigger;
- expose it in default discovery only while evidence is usable;
- add a kill switch and clear failure/recovery instructions;
- defer after the one-day implementation timebox if external instability makes
  maintenance value poor.

### U4-03 — Cross-provider isolation and mixed soak

Prove profiles, sessions, accounts, context, diagnostics, quotas, and model
identity cannot cross providers. Run a 24-hour mixed workload only across
currently live-ready providers.

### U4-04 — Publish v0.5.0 fleet beta

Publish the evidence matrix with exact live-ready, degraded, disabled, and
deferred states. Never market the number of compiled adapters as working
providers.

**U4 estimate:** 10–25 focused days. External providers may be deferred.  
**U4 exit gate:** the useful fleet is truthful; all compiled-but-unproven
providers are hidden from default model discovery.

## 10. Phase U5 — Public beta and v1.0

**Outcome:** a scoped, supportable release rather than an eternal development
repository.

### U5-01 — Release conformance and reproducibility

- rebuild artifacts twice and compare outputs or document unavoidable variance;
- verify SBOM, checksums, attestations, signer workflow, tag binding, rollback,
  uninstall, and recovery on clean Linux and Windows locations;
- add dependency review, secret scanning, CodeQL or equivalent static analysis,
  and pinned action maintenance;
- define supported OS, architecture, Node, Chrome/Chromium, and harness matrix.

### U5-02 — Load, soak, and chaos gates

Measure startup, idle memory, first observed text, completion, concurrency,
queueing, cancellation, browser crash, daemon crash, worker restart, network
loss, corrupt state, full disk, slow consumer, quota, challenge, and provider
layout change. Set written thresholds before running the gate.

### U5-03 — Operator experience and support boundary

- one verified install path per supported OS;
- status/doctor command with actionable failures;
- login, logout, reprobe, reset, diagnostics export, update, rollback, and
  uninstall commands;
- concise quick start plus architecture, security, privacy, troubleshooting,
  contribution, provider-policy, and release documents;
- issue templates that request sanitized diagnostics, never secrets;
- explicit experimental warning and no guarantee of consumer-web availability.

### U5-04 — Scoped public beta

Publish a beta candidate, recruit a small opt-in cohort, collect only bounded
technical evidence, fix release-blocking defects, and freeze features.

### U5-05 — v1.0 decision and release

Release v1.0 only when:

- official/local stable paths pass conformance;
- at least one browser provider passes current extension and Patchright canaries;
- no known critical/high security issue remains;
- supported-platform install/update/rollback/uninstall pass;
- 24-hour soak meets written thresholds;
- documentation states live-ready and deferred providers truthfully;
- owner gates for license, provider policy, release wording, and publication are
  explicitly approved.

**U5 estimate:** 10–15 focused days plus beta observation time.

## 11. Phase U6 — Measure, then optimize

This phase is conditional and does not block v1.0 unless performance misses its
published support thresholds.

### U6-01 — Benchmark TypeScript

Profile daemon startup, idle RSS, CPU, IPC throughput, bridge chunking, SQLite,
scheduler, streaming reconciliation, and concurrent sessions using release
workloads. Separate browser/network time from relay overhead.

### U6-02 — Rust decision

Keep TypeScript when relay overhead is a small fraction of end-to-end latency
and supported concurrency/memory gates pass. Prototype only a measured hot path
when:

- relay CPU or memory breaks a written release threshold;
- profiling identifies a stable transport-independent hotspot;
- the prototype can preserve protocol behavior through the same conformance
  suite;
- packaging and maintenance cost is justified by measured gain.

Do not rewrite browser drivers, provider semantics, or the whole daemon merely
for language preference.

## 12. Dependency and parallelism map

```text
P0-05
  -> U0-01 Fedora proof
  -> U0-02 Windows proof
  -> U0-03 dogfood
  -> U0-04 v0.1.0
      -> U1 evidence/lifecycle
          -> Claude + Gemini (parallel after shared contract)
          -> U1 dogfood/v0.2.0
              -> U2 stable backends
              -> U3 extension foundations
                  -> U4 provider fleet
                      -> U5 public v1.0
                          -> U6 conditional optimization
```

Safe parallel groups:

- U0: deterministic test/fixture work may run beside documentation/evidence
  work, but live browser/Hermes probes remain serialized.
- U1: Claude and Gemini may proceed in parallel only after the shared lifecycle
  contract is frozen and their files are disjoint.
- U2: official upstream and local-server adapters may proceed in parallel after
  backend selection types are frozen.
- U3: pure streaming reconciler and protocol tests may proceed in parallel
  after schemas/interfaces are frozen; Native Messaging and MCP stdio work must
  remain separate.
- U4: provider adapters may proceed in parallel only with separate profiles,
  files, live accounts, and a shared frozen conformance kit; cap at three.
- U5: docs/support, deterministic release verification, and load harness may
  proceed in parallel; one integrator owns release claims.

## 13. Evidence gates

| Evidence | Proves | Does not prove |
|---|---|---|
| Unit test | local function behavior | browser/provider usability |
| Fixture/integration | adapter behavior against recorded/synthetic UI | current live layout or account access |
| Mock E2E | relay pipeline and harness contract | real provider readiness |
| Live probe | one current provider turn in one environment | long-session reliability |
| Live E2E | defined real workflow at a commit/time | other OSes/providers or future stability |
| Dogfood | repeated practical usefulness and recovery | public supportability |
| Soak/load/chaos | reliability under defined stresses | correctness outside its matrix |
| Release verification | artifact identity and install behavior | provider availability |

Every evidence record includes commit, relay version, transport, provider/model,
OS, browser, Node, timestamp, test ID, result, failure class, and sanitized
artifact path. Live evidence expires on relevant code or provider-surface
change and after a written TTL.

## 14. Cost and escalation controls

- Start every task with the cheapest capable model/effort that can execute its
  bounded contract.
- Reproduce and test the smallest failing path before broad analysis.
- Escalate model/effort only after a concrete failure record, ambiguous security
  boundary, or cross-cutting architecture decision.
- Limit agents to the minimum independent workstreams; default is one.
- Require a worker to return changed paths, exact checks, unresolved risks, and
  a compact handoff instead of repeating repository history.
- Abort duplicate work when `TASK.md`, remote PRs, or `main` show completion.
- Provider UI archaeology is capped at one day before defer/disable.
- No new technology is adopted without a measured problem, simpler rejected
  alternative, rollback path, and owner-visible value.

## 15. Owner decisions and unavoidable manual actions

Only the maintainer may:

- complete provider login, 2FA, CAPTCHA, and account selection;
- approve provider-policy risk and which accounts may be used;
- approve release environment/tag protection and release publication;
- merge PRs and choose release wording;
- expand supported platforms or public beta scope;
- approve any destructive migration or deletion of user data.

Agents prepare every reversible step before requesting an owner action and give
one exact minimal command or click sequence. Waiting for an owner gate does not
authorize unrelated work.

## 16. Definition of done

### Useful now — v0.1.0

- ChatGPT live-proven through Hermes on Fedora and Windows;
- authenticated install and rollback;
- restart/recovery and 20-mission dogfood gate;
- honest alpha documentation.

### Personal beta — v0.2.0

- ChatGPT plus Claude and Gemini, or explicit truthful deferrals;
- shared recovery and capability evidence lifecycle;
- 30-mission mixed dogfood gate.

### Stable-backend beta — v0.3.0

- official OpenAI-compatible and local model paths;
- Responses API and MCP control plane;
- explicit selection, cancellation, and privacy-safe observability.

### Extension beta — v0.4.0

- visible-tab MV3 transport with one live provider;
- restart-safe protocol, durable generations, streaming reconciler, native-host
  installation, and security review;
- Patchright retained as explicit fallback.

### Fleet beta — v0.5.0

- conformance kit and truthful per-provider live evidence;
- unsupported/unproven providers deferred or hidden;
- mixed-provider isolation and soak.

### Project end — v1.0

- scoped supported matrix, stable backends, at least one current browser path,
  signed reproducible delivery, doctor/recovery/uninstall, security and policy
  gates, 24-hour soak, public documentation, and no critical/high known issue;
- remaining experimental ideas are ordinary post-v1 backlog, not blockers.

## 17. Task advancement protocol

At merge time, the same PR—or an immediately prepared follow-up—must:

1. mark the completed task and link its PR/CI evidence;
2. update current status in README/project documents;
3. replace `TASK.md` with exactly the next unblocked assignment from this plan;
4. define scope, acceptance commands, owner gates, and parallel-safe paths;
5. verify no open PR or merged commit already completed that assignment.

This prevents the repository from repeatedly assigning already-merged work and
keeps Codex CLI usable without an agent bus.
