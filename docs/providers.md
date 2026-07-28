# Provider fleet

> **Readiness notice:** The table below records implemented adapters and mock
> pipeline coverage. It does not establish current authenticated provider
> readiness. Runtime capability evidence controls `/v1/models`; U0-01 refreshes
> ChatGPT live evidence on the current Patchright commit, and later providers
> require their own bounded live gates.

## Selection rules

The relay prioritizes direct first-party webchats with strong models, useful
free or existing-subscription access, international availability, and a UI
that can plausibly be maintained as an isolated adapter. Aggregators are
deliberately excluded from the initial fleet because they duplicate models and add
another dependency layer.

## Provider fleet

| Priority | Relay model ID | Webchat | Why it earns a slot | Status |
|---:|---|---|---|---|
| 1 | `browser-chatgpt-free` | ChatGPT | Proven reference adapter and broad tool-use ability | Mock E2E; live refresh required |
| 2 | `browser-claude-free` | Claude | Strong coding, writing, and long-horizon work | Mock E2E; live pending |
| 3 | `browser-gemini-free` | Gemini | Large context, multimodal work, Google account access | Mock E2E; live pending |
| 4 | `browser-deepseek-free` | DeepSeek | High-value reasoning/coding and open-weight lineage | Mock E2E; live pending |
| 5 | `browser-zai-glm-5.2` | Z.ai | GLM 5.2 access and strong agent/coding capability | Mock E2E; live pending |
| 6 | `browser-minimax-m3` | MiniMax Agent | M3 agent workflow and long-context value | Mock E2E; live pending |
| 7 | `browser-kimi-free` | Kimi | Long-context research and coding | Mock E2E; live pending |
| 8 | `browser-qwen-free` | Qwen Chat | Broad open-weight model family and multilingual ability | Mock E2E; live pending |
| 9 | `browser-grok-free` | Grok | Distinct frontier model family and live-information strength | Mock E2E; live pending |
| 10 | `browser-mistral-free` | Mistral Le Chat | Fast EU-hosted alternative and open-weight ecosystem | Mock E2E; live pending |
| 11 | `browser-meta-free` | Meta AI | First-party Llama-family assistant and Meta ecosystem integration | Historical live probe; refresh required |
| 12 | `browser-arena-free` | LMSYS Chatbot Arena | Login-free access to a diverse pool of models | Mock E2E; live pending |

Mock E2E validates relay plumbing against the in-process fake DOM; it does not
validate a provider's current site, authentication, quota, or selectors.

## Canonical web surfaces

| Adapter | URL |
|---|---|
| ChatGPT | <https://chatgpt.com> |
| Claude | <https://claude.ai> |
| Gemini | <https://gemini.google.com> |
| DeepSeek | <https://chat.deepseek.com> |
| Z.ai | <https://chat.z.ai> |
| MiniMax Agent | <https://agent.minimax.io> |
| Kimi | <https://kimi.com> |
| Qwen Chat | <https://chat.qwen.ai> |
| Grok | <https://grok.com> |
| Mistral Le Chat | <https://chat.mistral.ai> |
| Meta AI | <https://www.meta.ai> |
| LMSYS Chatbot Arena | <https://chat.lmsys.org> |

## Adapter contract

Every new browser provider must have:

1. Its own driver containing only site-specific URL, composer, send, response,
   login, rate-limit, and completion-detection logic.
2. A dedicated persistent profile below
   `~/.local-ai-relay/browser-profiles/<provider>`.
3. Native Patchright/Playwright-compatible input; no direct `textContent` mutation or deprecated
   `execCommand` insertion.
4. Shared conversation planning and compact tool-schema handling.
5. Explicit cancellation, timeout, serialized access, and redacted local
   diagnostics.
6. Unit tests plus a sanitized authenticated E2E report before registration.

## Implementation order

Claude and Gemini come next because they add the largest capability and
subscription value. DeepSeek, Z.ai, and MiniMax follow as the highest-value
free alternatives. Kimi, Qwen, Grok, Mistral, and Meta AI complete model,\necosystem, and regional diversity.

## Capability tracking

The relay tracks provider readiness through a capability tracker so that
`/v1/models` advertises only genuinely usable models. A provider is not
ready merely because its adapter compiles; it must have runtime evidence
of usability.

### Capability states

| State | Meaning | Advertised in `/v1/models`? |
|---|---|---|
| `installed` | Adapter code exists; never verified at runtime | No |
| `authenticated` | Login succeeded; reachability not confirmed | No |
| `reachable` | Network-level contact confirmed | No |
| `ready` | Full end-to-end capability verified with fresh evidence | **Yes** |
| `degraded` | Partially working with fresh evidence | **Yes** |
| `disabled` | Administratively turned off by the operator | No |

### Discovery endpoints

- `GET /v1/models` — lists only models from `ready` or `degraded` providers.
  This is the default and what OpenAI-compatible clients should use.
- `GET /v1/models?include=all` — lists every registered model with
  `x_relay.capability_status` metadata for diagnostic use.
- `GET /v1/providers/status` — exposes the full capability state of every
  provider, including evidence references and expiration timestamps.

### Evidence lifecycle

When a provider passes a live probe, the tracker records a reference with a
timestamp and 24-hour expiry. Current evidence is restored on daemon restart.
Expired evidence remains visible in diagnostics but removes the provider from
the default `/v1/models` catalog until it is re-verified. Mock canaries never
persist live readiness.

## Experimental nature & streaming mode

All browser-based providers are **experimental fallback adapters**. 

### Streaming Mode (UI-Observed Streaming)
Browser interfaces do not naturally expose token-by-token API streams. Instead, the relay implements **UI-observed streaming**:
1. It polls or observes mutations in the browser DOM corresponding to the assistant's message container.
2. It tracks the growth of the text content dynamically.
3. It extracts newly appended text slices and packages them into mock compatibility Server-Sent Events (SSE) chunks.
4. Clients receive a simulated stream corresponding to visual rendering updates, rather than raw upstream token chunks.
