# Project: local-ai-relay

> **Historical v1 implementation snapshot.** The executable v2 architecture,
> risk gates, and dependency graph now live in
> [`docs/plans/v2-master-plan.md`](docs/plans/v2-master-plan.md). The one current
> assignment and its required deliverable live in [`TASK.md`](TASK.md). Do not
> use the historical milestone table below to claim current provider readiness.

## Architecture
- **API Routing Layer (`src/routes/`)**: Receives OpenAI-compatible POST requests at `/v1/chat/completions` and routes them to the correct provider adapter.
- **Provider Adapter Layer (`src/providers/`)**: Translates OpenAI request payloads (messages, tools, options) into browser chat prompts using `ConversationPlanner` and `ToolBridge`, then parses the output.
- **Browser Driver Layer (`src/browser/`)**: Receives the prompt/options, manages the Chromium browser page, types into the composer, clicks the send button, and monitors the assistant response until stable.
- **Browser Runtime Layer (`src/browser/runtime.ts`)**: Initializes Playwright/Patchright contexts.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| E2E | E2E Testing Track | Historical v1 mock-E2E work; current acceptance is defined only in `TASK.md`. | None | SUPERSEDED |
| 1 | Implement Arena.ai | Implement the missing login-free Arena.ai driver and provider. Register Arena.ai in registry.ts. | None | DONE |
| 2 | Shared Context & SSO | Implement `BrowserContextManager` for shared browser profiles (R2) and automated Google SSO login in `BaseBrowserDriver`. | Milestone 1 | IN_PROGRESS |
| 3 | Register Providers | Register and verify Claude, DeepSeek, Z.ai, MiniMax, Kimi, Qwen, Grok, and Mistral in `registry.ts`. | Milestone 2 | PLANNED |
| 4 | Final E2E & Hardening | Verify all providers against 100% E2E tests, and perform Tier 5 adversarial coverage hardening. | Milestone 3, E2E | PLANNED |

## Interface Contracts
### `BrowserContextManager` (R2 Shared Context)
- `BrowserContextManager.getInstance(options): BrowserContextManager` (Singleton)
- `BrowserContextManager.getContext(): Promise<BrowserContext>`
- `BrowserContextManager.close(): Promise<void>`
- Shared profile path: `~/.local-ai-relay/browser-profiles/shared`

### `BaseBrowserDriver` SSO Hook
- `BaseBrowserDriver.handleSsoLogin(page: Page): Promise<boolean>`
  - Intercepts landing pages with sign-in buttons or Google login redirection to accounts.google.com.
  - Automatically clicks "Continue with Google" / "Sign in with Google" and selects the first active/consent Google account.

## Code Layout
- `src/browser/`: Browser drivers (`base-driver.ts`, `runtime.ts`, `driver-registry.ts`, `<provider>-driver.ts`)
- `src/providers/`: Provider adapters (`registry.ts`, `types.ts`, `<provider>-browser.ts`)
- `src/cli/`: Command-line tools for manual login and probing
- `tests/e2e/`: Location for new E2E tests created by the E2E Testing Track
