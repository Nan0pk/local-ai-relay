# Roadmap

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
- [ ] Sanitized DOM-fixture regression test
- [ ] Explicit logout, usage-limit, and challenge-page error classes

## Provider expansion

- [ ] Claude (`browser-claude-free`)
- [ ] Gemini (`browser-gemini-free`)
- [ ] DeepSeek (`browser-deepseek-free`)
- [ ] Z.ai / GLM 5.2 (`browser-zai-glm-5.2`)
- [ ] MiniMax M3 (`browser-minimax-m3`)
- [ ] Kimi (`browser-kimi-free`)
- [ ] Qwen (`browser-qwen-free`)
- [ ] Grok (`browser-grok-free`)
- [ ] Mistral Le Chat (`browser-mistral-free`)
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

## Hardening

- [ ] Optional bearer-token middleware
- [ ] Per-token rate limiting and request-ID propagation
- [ ] Structured redacted logging and Prometheus metrics
- [ ] Backpressure and failure-mode tests
- [ ] 24-hour mixed-provider soak test
- [ ] Security review before a stable release
