# North star

## Mission

Give agent harnesses one local OpenAI-compatible endpoint for the best useful
API, local, and browser-based AI resources without handing credentials to a
hosted proxy.

## Product principles

1. **Local first:** the process and browser profiles stay on the user's machine.
2. **Value first:** free and already-paid access is preferred when capability
   is competitive.
3. **No false availability:** models appear in discovery only after real E2E
   validation.
4. **One contract:** all backends pass through the same registry, error model,
   logging boundary, and OpenAI-compatible surface.
5. **Isolated adapters:** a website change breaks one driver, not the relay.
6. **User-controlled authentication:** normal visible login only; no extracted
   cookies, copied tokens, CAPTCHA bypass, or credential collection.

## Success

- Hermes can select a named relay model and complete a real tool round trip.
- Browser prompts stay compact across long agent sessions.
- Adding Claude, Gemini, DeepSeek, Z.ai, MiniMax, Kimi, Qwen, Grok, or Mistral
  does not require route changes.
- Failure is explicit and recoverable; the relay never silently switches to a
  different model or provider.
- A clean checkout builds, tests, and starts with one documented command.

The selected provider fleet and implementation order live in
[providers.md](providers.md); delivery gates live in [roadmap.md](roadmap.md).
