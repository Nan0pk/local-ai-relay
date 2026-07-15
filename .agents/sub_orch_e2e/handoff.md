# Handoff Report - local-ai-relay Exploration

## 1. Observation
The following files were inspected and analyzed:
* `src/providers/registry.ts`: Defines registered providers.
  ```typescript
  import { MockProvider } from './mock.js';
  import { ChatGptBrowserProvider } from './chatgpt-browser.js';
  import { GeminiBrowserProvider } from './gemini-browser.js';
  ...
  const providers: Provider[] = [mockProvider, chatGptBrowserProvider, geminiBrowserProvider];
  ```
* `src/providers/chatgpt-browser.ts` & `src/providers/gemini-browser.ts`: Register model IDs `browser-chatgpt-free` (line 12) and `browser-gemini-free` (line 8) respectively. They instantiate `ConversationPlanner` and delegate prompts to Playwright/Patchright browser drivers.
* `src/providers/tool-bridge.ts`: Handles tool-calling. Instructs models to output tool calls in XML-like envelopes (e.g., `<relay_tool_calls nonce="[nonce]">...JSON array...</relay_tool_calls>`) and parses/validates them via Ajv.
* `src/routes/chat.ts`: Extracts `x-relay-session` headers and passes them as `sessionId` in `ProviderRequestContext`.
* `src/providers/conversation-planner.ts`: Optimizes session messages, computes `resetSession`, and splits message arrays into deltas for continuation.
* `src/browser/base-driver.ts`: Manages the Playwright/Patchright page cache `this.pages = new Map<string, Page>()` with max 8 tabs (`RELAY_BROWSER_MAX_SESSIONS`), serialization queue, and assertions for rate limits, captchas, and login pages.
* `src/cli/browser-login.ts`: Launches headful browser sessions for interactive sign-in; no automatic credentials typing is implemented.
* `src/routes-chat.test.ts` & `src/browser/base-driver.test.ts`: Define mock-driven tests for Node's built-in `node:test` runner.

Executed terminal command `npm test` inside `/home/victus/agy`:
```bash
ℹ tests 181
ℹ suites 9
ℹ pass 181
ℹ fail 0
ℹ duration_ms 2591.603553
```

## 2. Logic Chain
1. **Providers and Models**: Based on `registry.ts` lines 12–23, only three providers are registered in the main registry. Inspecting `mock.ts`, `chatgpt-browser.ts`, and `gemini-browser.ts` shows the model IDs are `mock-gpt-4o-mini`, `mock-gpt-4o`, `browser-chatgpt-free`, and `browser-gemini-free`.
2. **Browser Provider Design**: `ChatGptBrowserProvider` and `GeminiBrowserProvider` are wrappers around `ChatGptPlaywrightDriver` and `GeminiPlaywrightDriver`. They plan prompts, invoke drivers, and parse responses.
3. **Tool Calling Bridge**: `tool-bridge.ts` formats instructions containing minified tool schemas and parses model outputs using an XML envelope with a unique session-turn nonce to prevent replay attacks.
4. **Session Persistence**: Fastify extracts `x-relay-session` from headers and passes it to the provider. The `ConversationPlanner` maintains in-memory chat histories and determines whether to perform a delta continuation or force a reset. The `BaseBrowserDriver` maintains a map of page tabs corresponding to each active session, reusing the same Playwright `BrowserContext` to share cookies.
5. **SSO and Login**: Analysis of `browser-login.ts` and `base-driver.ts` confirms that no credentials-typing hooks or automated login procedures exist. Login is performed interactively by headful browsers, and cookies are cached in the persistent profile folder. The codebase uses `loginUrlPattern` regex patterns in driver configs to detect redirection to login surfaces and throw `login_required` failures.
6. **Existing Tests**: Executing `npm test` runs Node.js `node:test` on ts files (using `tsx`). The tests mock the browser driver and DOM API to verify route mapping and provider behavior without requiring a running browser.

## 3. Caveats
* The actual E2E interaction with real browsers (i.e. running in a headful mode with real credentials) was not executed, as this is a read-only investigation and no active accounts were provided.
* Real-world E2E tests will require pre-configured, signed-in browser profiles (under `~/.local-ai-relay/browser-profiles/`) or a headless login mechanism, which is not currently present in the codebase.

## 4. Conclusion
The technical structure of `local-ai-relay` is clean, modular, and optimized for mock-based unit testing. Designing a full E2E test suite will require establishing pre-signed-in browser profile folders on the test runner machine since login is purely interactive. The mock-driven tests are robust, and the shared test matrix makes extending provider tests trivial.

## 5. Verification Method
1. Inspect the detailed exploration report:
   `/home/victus/agy/.agents/sub_orch_e2e/exploration_report.md`
2. Run the test suite:
   ```bash
   cd /home/victus/agy && npm test
   ```
   All 181 tests should pass.
