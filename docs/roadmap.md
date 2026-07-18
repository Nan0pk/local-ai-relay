# Roadmap

> **Execution notice:** This is a historical implementation checklist, not the
> current task queue or a live-readiness matrix. Follow
> [the use-first completion plan](plans/use-first-completion-plan.md) and
> [TASK.md](../TASK.md). A checked adapter may have mock coverage while still
> lacking fresh authenticated live evidence.

Each provider is shipped independently and registered only after a real
authenticated E2E pass.

## Foundation — complete

- [x] OpenAI-compatible health, models, and chat-completions routes
- [x] Provider registry with no bypass or silent fallback
- [x] Deterministic mock and startup smoke tests
- [x] Linux setup, port selection, systemd service, and Hermes configuration
- [x] SSE compatibility, sticky sessions, compact tools, and tool-call bridge

## Reference adapter: ChatGPT — complete

- [x] Isolated persistent browser profile and visible login
- [x] Native large-prompt insertion and reliable send-button readiness
- [x] Full first mission and delta-only continuations
- [x] Tool-schema omission on continuation turns
- [x] Authenticated Fedora Hermes → relay → ChatGPT → tool → Hermes E2E
- [x] Sanitized DOM-fixture regression test
- [x] Explicit logout, usage-limit, and challenge-page error classes

## Provider expansion — complete

- [x] Claude (`browser-claude-free`)
- [x] Gemini (`browser-gemini-free`)
- [x] LMSYS Chatbot Arena (`browser-arena-free`)
- [x] DeepSeek (`browser-deepseek-free`)
- [x] Z.ai / GLM 5.2 (`browser-zai-glm-5.2`)
- [x] MiniMax M3 (`browser-minimax-m3`)
- [x] Kimi (`browser-kimi-free`)
- [x] Qwen (`browser-qwen-free`)
- [x] Grok (`browser-grok-free`)
- [x] Mistral Le Chat (`browser-mistral-free`)
- [x] Meta AI (`browser-meta-free`)

For every checkbox: isolated driver, login/probe command, unit tests, sanitized
fixture where feasible, live E2E report, and only then registry/Hermes exposure.
The rationale and exact order are in [providers.md](providers.md).

## Shared reliability

- [ ] Extract reusable browser session/profile lifecycle helpers
- [ ] Provider-specific logout, challenge, rate-limit, and quota detection
- [ ] Session inspection and cancellation endpoints
- [ ] Safe redacted Patchright traces
- [ ] Structured recoverable provider errors
- [ ] True upstream streaming for providers that expose it reliably

## API and local providers

- [ ] Generic OpenAI-compatible upstream adapter
- [ ] Local Ollama/LM Studio adapter
- [ ] Environment/keychain-backed credentials
- [ ] Capability-aware routing without silent model substitution

## Hardening — complete

- [x] Optional bearer-token middleware
- [x] Per-token rate limiting and request-ID propagation
- [x] Structured redacted logging and Prometheus metrics
- [x] Backpressure and failure-mode tests
- [x] 24-hour mixed-provider soak test
- [x] Security review before a stable release
