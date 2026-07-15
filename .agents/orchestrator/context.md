# Project Context — local-ai-relay

This file documents the contextual background, architectural details, and constraints of the local-ai-relay project.

## Project Goal
To connect OpenAI-compatible clients to webchat providers (Claude, DeepSeek, Z.ai, MiniMax, Kimi, Qwen, Grok, Mistral, Arena.ai, Gemini, ChatGPT) using browser automation (Playwright/Patchright), bypassing manual browser logins via a shared context + Google SSO click automator.

## Reference Implementations
- **ChatGPT Browser Provider**: Located at `src/providers/chatgpt-browser.ts` and `src/browser/chatgpt-driver.ts`.
- **Base Browser Driver**: Located at `src/browser/base-driver.ts`, defines selectors, error handling, typing/sending, and response stabilization.

## Key Technical Details
- **Fastify Web Server**: Serves API requests.
- **Persistent Profiles**: Currently stored per-provider in `~/.local-ai-relay/browser-profiles/`.
- **Unit Testing**: Native Node.js test runner runs mock unit tests in `src/`.
