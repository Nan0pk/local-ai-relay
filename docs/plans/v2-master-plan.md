# local-ai-relay v2 Hybrid — Master Execution Plan

**Status:** proposed execution source of truth  
**Updated:** 2026-07-17  
**Scope:** repository truth, transport migration, API/MCP integration, provider
rollout, security, packaging, and the conditional Rust decision

This plan supersedes milestone claims in `PROJECT.md` and `docs/roadmap.md` when
they conflict. It does not make a provider, release, legal, or performance
claim by itself; evidence gates below do that.

## 1. Outcome

Deliver a local compatibility gateway with three explicit backend classes:

1. **Stable:** official OpenAI-compatible or Anthropic-compatible upstreams.
2. **Stable when locally configured:** local model servers such as Ollama,
   llama.cpp, OpenVINO Model Server, or mistral.rs.
3. **Experimental:** user-authorized visible-browser adapters.

Keep the current TypeScript/Fastify core until post-extension benchmarks prove
that it is the limiting cost. Add a Manifest V3 extension without deleting the
Patchright transport. Use MCP for control and delegation; keep model traffic on
OpenAI-compatible and Responses-style endpoints.

## 2. Non-negotiable decisions

- Do not claim CAPTCHA bypass or implement protection circumvention.
- Do not automatically choose a login account or submit credentials.
- Do not advertise an unavailable or unverified provider as ready.
- Do not execute remotely downloaded code in the extension. Bundle imperative
  logic; permit only constrained, schema-validated remote data and kill
  switches after policy review.
- Do not call DOM sampling “true upstream streaming.” Report the actual
  streaming mode.
- Do not silently substitute a local or different provider model.
- Do not auto-execute tool calls scraped from untrusted model text. Treat them
  as proposals subject to schema, policy, and approval.
- Do not rewrite the daemon in Rust before the transport is proven and measured.
- Do not make multiple agents the default. Coordination must save more tokens
  than it consumes.

## 3. Verified starting point

Baseline at `cc1cdbedead45d683d3007d867aae0c725f81e70`:

- Typecheck, build, 196 unit tests, and startup smoke test pass.
- The dedicated mock-backed E2E suite passes 55 of 60 tests.
- One failure exposes a real tool-envelope echo problem; four appear to be stale
  or incorrect fixture expectations and still need an explicit disposition.
- Current SSE behavior buffers the website response and emits compatibility
  chunks afterward.
- All browser providers are registered regardless of live readiness.
- Live-provider evidence and current documentation disagree.
- Browser sessions, planner sessions, and shared profile lifecycle can diverge.
- API loopback authentication is optional and not a safe external-bind default.
- A project license has not been selected.

Re-run and record this baseline in Phase 0; never copy these claims forward as
fresh evidence.

## 4. Target architecture

```text
IDE / harness ── OpenAI Chat + Responses ─┐
MCP host ─────── MCP adapter process ─────┤
                                          ▼
                                   singleton daemon
                           capability registry + scheduler
                              session state + SQLite
                          /            |              \
               extension transport  Patchright    API/local upstream
                       |              fallback          adapter
              native-host process
                       |
              MV3 service worker
                       |
              provider content script
                       |
                user-approved tab
```

One distributable may expose multiple modes:

```text
local-ai-relay daemon
local-ai-relay native-host
local-ai-relay mcp
local-ai-relay setup
```

Native Messaging and MCP both use `stdio`, with different framing. They must be
separate processes or modes connected to the daemon over a Unix socket or
Windows named pipe.

## 5. System contracts

### Capability truth

Track providers as `installed`, `authenticated`, `reachable`, `ready`,
`degraded`, or `disabled`. A dashboard may display all known providers, but
`/v1/models` lists only currently usable models unless a compatibility mode
explicitly requests otherwise.

Every live-ready claim records provider, model, transport, relay commit,
extension version, browser version, OS, timestamp, test ID, and evidence path.
Evidence expires when an adapter or relevant provider surface changes.

### Bridge protocol

Every frame includes:

```text
protocol_version, request_id, session_id, page_generation,
sequence_number, event_type, payload_length, payload_hash
```

Events are `hello`, `capabilities`, `ack`, `append`, `replace`, `snapshot`,
`final`, `error`, `cancel`, `heartbeat`, and `resume`.

Use bounded multipart frames from the first implementation. Keep individual
JSON Native Messaging frames well below Chrome's limit; the initial target is
256 KiB including envelope overhead. Reassembly requires total size, part
count, part hash, final payload hash, deadline, and a memory/disk quota.
Diagnostics use an artifact handle where possible instead of placing a large
screenshot or DOM dump on the event stream.

### Restart and re-entry

The daemon owns request state. The service worker owns no irreplaceable state.
After worker restart it performs `hello/resume`, obtains active request IDs,
re-discovers the bound tab, samples its current DOM, and resumes observation.
It never submits the prompt again merely because it restarted.

Bind a conversation to `page_generation`. If the tab is replaced or loses its
conversation, increment the generation and replay full context or fail clearly;
never send a delta into an empty page.

### UI-observed streaming

Treat DOM text as volatile state. Normalize snapshots, calculate stable append
or replace operations, sequence every event, acknowledge progress, and finish
with an authoritative full snapshot plus hash. Test Markdown rerendering,
virtualized nodes, reasoning pauses, stop-button changes, and duplicate
mutations.

### Authentication and trust

- Bind HTTP to loopback by default and require a generated bearer token.
- If external bind is deliberately enabled, fail startup without explicit
  authentication and a warning acknowledgement.
- Native-host `allowed_origins` must contain the expected extension ID.
- Treat content-script messages and page content as untrusted.
- Use narrow host permissions and no cookie permission.
- Make diagnostics opt-in, size-bounded, redacted, and locally retained.
- A Native Messaging allowlist authenticates the extension identity; it does
  not make page content, a compromised extension, or tool text trustworthy.

### Tool proposals

Structural UI boundaries may reduce accidental parsing but cannot establish
intent reliably because providers can render quoted and generated content in
the same component. Therefore:

1. Remove valid live-nonce tool examples from prompts.
2. Parse into a `ToolProposal`, never directly into execution.
3. Validate tool name, schema, allowed risk class, request binding, and exact
   transcript location.
4. Require explicit approval for write, network, messaging, purchase, account,
   or destructive tools.
5. Make automatic read-only execution opt-in and auditable.

### Local inference and caching

Integrate local inference through upstream adapters; do not embed runtimes in
v2. Return the selected backend and transport in metadata. Exact caching may be
opted into for idempotent, tool-free requests. Semantic caching remains out of
the default path until privacy, freshness, tenant isolation, and evaluation
rules exist.

## 6. Work graph

This section is the architectural backlog, not the current assignment.
`TASK.md` contains the one task an agent should execute now, including its
scope, acceptance checks, and required deliverable. Do not select work directly
from this backlog while `TASK.md` is open.

### Phase 0 — Establish truth and remove immediate hazards

**Exit gate:** deterministic CI and dedicated E2E are green; provider discovery
is truthful; tool echo cannot execute; login is user-controlled; loopback has a
defensible default; the project clearly separates stable and experimental use.

### P0-01 — Repair E2E and tool-proposal safety

- Classify all five E2E failures with reproducible evidence.
- Remove the parsable live tool example and introduce proposal-only handling.
- Add echo, quote, prompt-injection, optional-argument, and destructive-tool
  adversarial tests.
- Accept when unit and dedicated E2E suites pass with no weakened assertions.

### P0-02 — Make provider capability discovery truthful

- Separate known adapters from ready provider instances.
- Gate `/v1/models` on runtime capability without hiding diagnostic status.
- Add tests for logged-out, challenge, quota, disconnected, and stale-evidence
  states.
- Accept when no unavailable provider is advertised as usable.

### P0-03 — Harden authentication and account selection

- Disable first-account SSO selection and document manual account choice.
- Add generated loopback bearer authentication, strict CORS/origin behavior,
  and unsafe-bind refusal.
- Threat-model browser pages, extensions, local processes, and diagnostics.
- Requires independent review because it changes a security boundary.

### P0-04 — Reconcile project truth and owner decisions

- Reconcile README, PROJECT, roadmap, provider matrix, ports, and E2E reports.
- Label browser providers experimental and state the actual streaming mode.
- Prepare a concise license comparison and obtain the maintainer's selection;
  do not invent approval.
- Record a provider-policy review gate without pretending it is legal advice.

### P0-05 — Secure bootstrap and dependency delivery

- Replace mutable-branch install instructions with versioned artifacts.
- Specify checksums, signatures, provenance, SBOM, rollback, and update policy.
- Keep setup user-level where each OS permits.
- Accept when tampered artifacts and unsupported versions fail closed.

### P0-06 — Establish measurements and CI categories

- Separate unit, fixture/integration, mock E2E, live E2E, and soak reports.
- Record daemon and Patchright baseline startup, idle memory, first observed
  text, completion latency, and failure classification.
- CI must validate deterministic code, tests, builds, and entry points.
- Never require credentials for deterministic pull-request CI.

### Phase 1 — Build transport-independent foundations

**Exit gate:** Patchright still works behind the new interfaces; protocol,
chunking, session recovery, scheduling, and reconciled streaming are tested
without requiring a live provider.

### P1-01 — Accept hybrid ADR and threat model

- Record the hybrid decision, trust boundaries, stable/experimental tiers, and
  conditional Rust threshold.
- Specify Native Messaging, local IPC, WebSocket-development fallback, and API
  authentication boundaries.
- Requires independent architecture/security review.

### P1-02 — Extract `BrowserTransport`

- Define probe, login, start/resume session, send turn, event stream, cancel,
  reset, and diagnostics interfaces.
- Wrap current Patchright behavior without changing provider semantics.
- Add contract tests usable by every future transport.

### P1-03 — Implement versioned bridge frames and chunking

- Define JSON Schema and generated TypeScript types.
- Implement bounded chunk/reassembly with hashes, timeout, duplicate handling,
  out-of-order rejection or recovery, and quotas.
- Test payloads below, at, and above 1 MiB plus incomplete and malicious sets.
- Requires independent security review.

### P1-04 — Add session generations and minimal durable state

- Store request/job metadata, provider capability evidence, session generation,
  and idempotency keys in SQLite.
- Do not persist prompt content by default.
- Recover or fail explicitly after daemon, browser, tab, and worker restart.

### P1-05 — Build the streaming reconciler

- Implement normalized snapshots, append/replace operations, sequence/ack, and
  authoritative final snapshots as a pure library.
- Add fixture tests for rerender, virtualization, pauses, duplicate mutations,
  reasoning sections, and cancellation.
- Report `ui_observed`, `buffered_compat`, or `upstream` streaming truthfully.

### P1-06 — Add scheduling, cancellation, and backpressure

- Queue per provider/account with bounded global concurrency.
- Propagate deadlines and cancellation through daemon, transport, and tab.
- Make retries idempotent and prevent duplicate prompt submission.
- Add overload and slow-consumer tests.

### Phase 2 — Prove the extension vertical slice

**Exit gate:** mock and one explicitly authorized live provider operate through
the extension on a visible tab, including restart, chunking, cancellation, and
manual login. Patchright remains usable.

### P2-01 — Create the WXT extension workspace

- Add a TypeScript/WXT MV3 package with narrow permissions and bundled code.
- Separate service-worker, content-script, provider-recipe, and protocol layers.
- Chrome/Edge first; preserve a testable Firefox path without blocking v2.

### P2-02 — Add native-host mode and local IPC

- Implement Native Messaging framing in a dedicated process mode.
- Connect to the singleton daemon over Unix socket or Windows named pipe.
- Validate extension identity, protocol version, quotas, and reconnect behavior.
- Requires independent security review.

### P2-03 — Implement worker rebind and tab generations

- Reconcile active daemon requests after service-worker restart.
- Rediscover the correct provider tab and resume observation without resubmit.
- Detect tab discard, navigation, manual user interference, and conversation
  replacement.
- Add deterministic restart and duplicate-submission tests.

### P2-04 — Complete mock-provider extension E2E

- Exercise API → daemon → native host → extension → mock page → response.
- Cover small and multipart payloads, append/replace/final, cancellation,
  browser closure, worker restart, and diagnostics handles.
- Run without network or provider credentials in CI.

### P2-05 — Add constrained provider recipes and diagnostics

- Define semantic selectors, state signals, composer behavior, completion
  signals, and version metadata as constrained data.
- Bundle imperative logic; remote data cannot introduce selectors outside
  allowlisted provider origins or arbitrary script behavior.
- Capture minimum redacted artifacts with TTL and explicit user action.

### P2-06 — Prove one user-authorized live adapter

- Select a provider only after maintainer authorization and policy review.
- Require visible manual login, no automatic account choice, and a manual path
  through challenges.
- Record current environment and sanitized evidence.
- Live evidence is not runnable in public credential-free CI.

### P2-07 — Implement user-level native-host setup

- Install/uninstall native-host manifests on Linux, Windows, and macOS using a
  versioned, reversible setup flow.
- Require the browser's explicit extension confirmation.
- Add dry-run, repair, upgrade, rollback, and path-with-spaces tests.

### P2-08 — Extension security review

- Review permissions, CSP, message validation, origin rules, recipe updates,
  diagnostics, local IPC, and native-host installer behavior.
- Threat-test malicious page messages, oversized frames, replay, tab confusion,
  prompt/tool injection, and compromised remote recipe data.
- Close all high-severity findings before Phase 3 release work.

### Phase 3 — Complete the gateway interfaces

**Exit gate:** clients can select healthy extension, Patchright, official API,
or local-server backends explicitly; Responses and MCP control interfaces have
contract tests and report the actual backend.

### P3-01 — Capability-aware backend selection

- Prefer the explicitly configured transport; never change model identity
  silently.
- Surface health, authentication, evidence age, transport, and streaming mode.
- Add explicit fallback policy with user-visible metadata.

### P3-02 — Add `/v1/responses`

- Implement the required Responses request/output/event subset behind shared
  internal request types.
- Preserve Chat Completions compatibility.
- Publish a clear compatibility matrix instead of silently dropping fields.

### P3-03 — Add official and local upstream adapters

- Implement a generic OpenAI-compatible upstream first.
- Add Anthropic-compatible mapping only after contract tests exist.
- Store credentials through environment/keychain references, never state files.
- Test against local mock servers; optional conformance tests cover Ollama and
  other explicitly configured runtimes.

### P3-04 — Add the MCP control plane

- Implement stable `stdio` and Streamable HTTP modes as appropriate.
- Expose a small surface: list/status/delegate/cancel/open-login/diagnostics.
- Prefer one parameterized delegate tool over per-provider tool explosion.
- Do not claim custom token notifications are standardized MCP streaming.

### P3-05 — Add privacy-safe observability

- Record request IDs, backend, transport, health, queue time, first observed
  text, completion time, restart count, and classified failure.
- Do not record prompt/response content by default.
- Serve a minimal embedded dashboard; UI framework choice must not complicate
  installation or CSP.

### P3-06 — Add exact cache as an optional policy

- Cache only explicitly eligible, tool-free, idempotent requests.
- Partition by user/config/backend/model and attach TTL and cache-hit metadata.
- Keep semantic caching out of scope until a separate evaluation approves it.

### Phase 4 — Provider rollout and release engineering

**Exit gate:** the beta installer is reversible and signed, deterministic CI is
green on supported OSes, high-risk work is independently reviewed, and every
advertised provider has fresh evidence.

### P4-01 — Build the provider conformance kit

- Create sanitized DOM fixtures, recipe linting, capability probes, failure
  taxonomy, session tests, and live-evidence templates.
- Make provider work a data/adapter task rather than a core rewrite.

### P4-02 — Roll out providers individually

- Migrate one provider per pull request.
- Require fixture tests, manual login, quota/challenge/logout handling,
  cancellation, session recovery, and current live evidence before readiness.
- Disable a provider quickly when evidence expires or the UI changes.

### P4-03 — Build signed, reproducible release artifacts

- Produce versioned artifacts, checksums, signatures, SBOM, provenance, and
  release notes for supported operating systems.
- Pin extension/native-host compatibility ranges and test downgrade/rollback.

### P4-04 — Run soak, chaos, and load gates

- Run at least a 24-hour mixed-backend soak and a 100-turn session test.
- Inject worker termination, tab discard, browser/daemon restart, slow DOM,
  malformed frames, disconnect, quota, and cancellation.
- Record resource use and failure recovery without secret-bearing artifacts.

### P4-05 — Publish an explicitly scoped beta

- Document stable versus experimental backends, actual streaming modes, setup,
  uninstallation, privacy, troubleshooting, and known provider-policy risks.
- Human maintainer approves release notes, live-account claims, store listing,
  license, and merge.

### Phase 5 — Decide performance migration from evidence

### P5-01 — Benchmark the post-extension TypeScript daemon

- Measure cold start, idle/resident memory, requests per second for API/local
  backends, bridge overhead, and packaging size without a shadow browser.
- Define pass/fail thresholds before looking at results.

### P5-02 — Decide or prototype Rust conditionally

- If thresholds pass, record “keep TypeScript” and stop.
- If they fail because of daemon/runtime cost, prototype only the measured hot
  boundary with Tokio/Axum and compare equivalent tests.
- Do not choose Zig for v2 without a separate evidence-backed ADR.

## 7. Model and token economy

| Tier | Use | Default proof |
|---|---|---|
| `economy` | Docs reconciliation, fixtures, mechanical refactors, status | Focused self-check |
| `standard` | Normal TypeScript, tests, adapters, CI | Self-check plus deterministic CI |
| `frontier` | Ambiguous protocol/security architecture or hard diagnosis | Independent exact-commit review |
| `owner` | License, account authorization, legal/store/release/merge decisions | Human decision |

Any capable model may perform any agent task. The tier is a recommended cost
ceiling. Escalate only after preserving a compact failure packet containing:
task ID, commit, exact failing command, smallest relevant output, attempted
fixes, and unresolved decision. Do not pay a frontier model to rediscover the
repository.

Context rules:

- Start from the task's `context` list; add files only when a dependency is
  discovered.
- Prefer symbols, diffs, and focused test output over whole files and logs.
- One builder normally owns a task end to end.
- Use an independent verifier only for high-risk gates or release claims.
- Parallelize only dependency-independent tasks with disjoint write scopes.
- Never ask several models the same open-ended question without a defined
  comparison criterion.

## 8. Release definition of done

The v2 beta is complete only when all of the following are evidenced:

- Deterministic CI and mock E2E pass on supported operating systems.
- No provider is advertised without current readiness evidence.
- Loopback and external-bind authentication behavior has security tests.
- Native Messaging multipart, replay, quota, restart, and identity tests pass.
- Service-worker restart does not duplicate prompt submission.
- Tab loss causes full replay or a clear error, never silent context loss.
- UI-observed streams reconcile exactly to the final DOM snapshot.
- Browser tool text cannot directly trigger a high-risk action.
- Install, upgrade, repair, rollback, and uninstall are tested.
- Diagnostics are opt-in, redacted, bounded, and expiring.
- The 24-hour soak and 100-turn tests meet written thresholds.
- License, release wording, live-account use, and browser-store publication are
  explicitly approved by the maintainer.

## 9. Explicitly deferred

- Embedded llama.cpp/OpenVINO runtimes.
- Default semantic caching.
- Remote executable extension/WASM logic.
- Private provider API interception as the primary transport.
- Invisible login or challenge handling.
- Full Rust or Zig rewrite before Phase 5 evidence.
- Automatic execution of destructive tools from scraped webchat text.
