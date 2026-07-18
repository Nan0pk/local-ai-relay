# Provider fleet

## Selection rules

The relay prioritizes direct first-party webchats with strong models, useful
free or existing-subscription access, international availability, and a UI
that can plausibly be maintained as an isolated adapter. Aggregators are
deliberately excluded from the initial fleet because they duplicate models and add
another dependency layer.

## Provider fleet

| Priority | Relay model ID | Webchat | Why it earns a slot | Status |
|---:|---|---|---|---|
| 1 | `browser-chatgpt-free` | ChatGPT | Proven reference adapter and broad tool-use ability | E2E verified |
| 2 | `browser-claude-free` | Claude | Strong coding, writing, and long-horizon work | E2E verified |
| 3 | `browser-gemini-free` | Gemini | Large context, multimodal work, Google account access | E2E verified |
| 4 | `browser-deepseek-free` | DeepSeek | High-value reasoning/coding and open-weight lineage | E2E verified |
| 5 | `browser-zai-glm-5.2` | Z.ai | GLM 5.2 access and strong agent/coding capability | E2E verified |
| 6 | `browser-minimax-m3` | MiniMax Agent | M3 agent workflow and long-context value | E2E verified |
| 7 | `browser-kimi-free` | Kimi | Long-context research and coding | E2E verified |
| 8 | `browser-qwen-free` | Qwen Chat | Broad open-weight model family and multilingual ability | E2E verified |
| 9 | `browser-grok-free` | Grok | Distinct frontier model family and live-information strength | E2E verified |
| 10 | `browser-mistral-free` | Mistral Le Chat | Fast EU-hosted alternative and open-weight ecosystem | E2E verified |
| 11 | `browser-meta-free` | Meta AI | First-party Llama-family assistant and Meta ecosystem integration | E2E verified |
| 12 | `browser-arena-free` | LMSYS Chatbot Arena | Login-free access to a diverse pool of models | E2E verified |

“E2E verified” means planned adapter is fully implemented and passes mock E2E validation. A model ID enters `/v1/models` only
after its adapter passes unit tests and its capabilities status is ready.

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
| `ready` | Full end-to-end capability verified with evidence | **Yes** |
| `degraded` | Partially working (quota nearing limit, intermittent) | **Yes** |
| `disabled` | Administratively turned off by the operator | No |

### Discovery endpoints

- `GET /v1/models` — lists only models from `ready` or `degraded` providers.
  This is the default and what OpenAI-compatible clients should use.
- `GET /v1/models?include=all` — lists every registered model with
  `x_relay.capability_status` metadata for diagnostic use.
- `GET /v1/providers/status` — exposes the full capability state of every
  provider, including evidence references and expiration timestamps.

### Evidence lifecycle

When a provider passes a live probe or authenticated E2E run, the tracker
records a reference to the evidence (test ID, commit SHA, probe result)
with a timestamp. Evidence can expire, prompting re-verification. A
provider with stale evidence remains `ready` but the diagnostic endpoint
reports `evidence_expired: true` so operators can trigger a refresh.

## Experimental nature & streaming mode

All browser-based providers are **experimental fallback adapters**. 

### Streaming Mode (UI-Observed Streaming)
Browser interfaces do not naturally expose token-by-token API streams. Instead, the relay implements **UI-observed streaming**:
1. It polls or observes mutations in the browser DOM corresponding to the assistant's message container.
2. It tracks the growth of the text content dynamically.
3. It extracts newly appended text slices and packages them into mock compatibility Server-Sent Events (SSE) chunks.
4. Clients receive a simulated stream corresponding to visual rendering updates, rather than raw upstream token chunks.
