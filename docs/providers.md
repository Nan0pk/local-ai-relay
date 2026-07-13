# Provider fleet

## Selection rules

The relay prioritizes direct first-party webchats with strong models, useful
free or existing-subscription access, international availability, and a UI
that can plausibly be maintained as an isolated adapter. Aggregators are
deliberately excluded from the first ten because they duplicate models and add
another dependency layer.

## Top 10

| Priority | Relay model ID | Webchat | Why it earns a slot | Status |
|---:|---|---|---|---|
| 1 | `browser-chatgpt-free` | ChatGPT | Proven reference adapter and broad tool-use ability | E2E verified |
| 2 | `browser-claude-free` | Claude | Strong coding, writing, and long-horizon work | Selected |
| 3 | `browser-gemini-free` | Gemini | Large context, multimodal work, Google account access | Selected |
| 4 | `browser-deepseek-free` | DeepSeek | High-value reasoning/coding and open-weight lineage | Selected |
| 5 | `browser-zai-glm-5.2` | Z.ai | GLM 5.2 access and strong agent/coding capability | Selected |
| 6 | `browser-minimax-m3` | MiniMax Agent | M3 agent workflow and long-context value | Selected |
| 7 | `browser-kimi-free` | Kimi | Long-context research and coding | Selected |
| 8 | `browser-qwen-free` | Qwen Chat | Broad open-weight model family and multilingual ability | Selected |
| 9 | `browser-grok-free` | Grok | Distinct frontier model family and live-information strength | Selected |
| 10 | `browser-mistral-free` | Mistral Le Chat | Fast EU-hosted alternative and open-weight ecosystem | Selected |

“Selected” means planned, not usable. A model ID enters `/v1/models` only
after its adapter passes unit tests and a real authenticated end-to-end run.

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
free alternatives. Kimi, Qwen, Grok, and Mistral complete model and regional
diversity.
