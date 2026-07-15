## 2026-07-15T19:08:40Z

Please explore the local-ai-relay codebase and answer the following questions to help design the E2E test suite:
1. List all registered providers and their models in `src/providers/registry.ts`.
2. Analyze how ChatGPT and Gemini browser providers are implemented. What model IDs do they register, and how do they interact with their browser drivers?
3. Locate where tool-calling / function-calling bridge is implemented (e.g. `src/providers/tool-bridge.ts` or similar). Explain how it works, what requests it expects, and how it formats responses.
4. Analyze how session management / session persistence is handled. Check `x-relay-session` headers in routing and how the browser driver caches or isolates page sessions.
5. Analyze any login / SSO automation features. Is there any Google SSO login hook in `BaseBrowserDriver` or other files, and where is it located?
6. Check how existing tests (like `src/routes-chat.test.ts` and `src/browser/base-driver.test.ts`) are structured and executed.

Write a detailed exploration report to `/home/victus/agy/.agents/sub_orch_e2e/exploration_report.md`. Make sure it covers all 5 features in detail.

## 2026-07-16T00:11:32Z

Please implement the E2E Test Suite and infrastructure for the local-ai-relay project. 

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your tasks are:
1. Create `src/browser/mock-browser.ts` implementing mock `BrowserContext`, `Page`, and `Locator` classes that mimic Playwright/Patchright. The mock page should save user typed prompts in a composer variable, and dynamically generate mock responses when send is triggered. It should handle triggers like `trigger:login`, `trigger:captcha`, `trigger:rate_limit`, `trigger:quota`, `trigger:composer_disabled`, `trigger:empty_response`, or tool calls with a nonce.
2. Modify `src/browser/runtime.ts` to check `process.env.RELAY_MOCK_BROWSER === 'true'` and return the mock browser context if true.
3. Stub the unimplemented SSO contracts in the codebase so they compile:
   - Create `src/browser/context-manager.ts` exporting a stub of `BrowserContextManager` matching the contract in `PROJECT.md` (getInstance, getContext, close).
   - Add `async handleSsoLogin(page: Page): Promise<boolean>` stub method to `BaseBrowserDriver` in `src/browser/base-driver.ts`.
4. Create the E2E test suite at `/home/victus/agy/tests/e2e/e2e.test.ts`. Write exactly 60 test cases structured across the 4 Tiers for the 5 Features:
   - Feature 1: Chat Completion routing and models list (OpenAI compatibility)
   - Feature 2: Browser session management / session persistence
   - Feature 3: Tool-calling / function-calling bridge
   - Feature 4: Login automation (SSO automation / shared profile)
   - Feature 5: Provider specific completions (including login-free Arena.ai and other registered providers)
   Ensure the test suite runs the Fastify app in-process on a random port, executes HTTP requests via fetch (or Fastify's inject where appropriate, but real HTTP requests are preferred), and asserts responses.
5. Add the E2E test script `"test:e2e": "node --import tsx --test tests/e2e/e2e.test.ts"` to `package.json`.
6. Write `TEST_INFRA.md` at the project root using the template in the instructions and the draft at `/home/victus/agy/.agents/sub_orch_e2e/test_infra_draft.md`.
7. Once all tests are verified to pass (run `npm run test:e2e` and `npm test`), publish `TEST_READY.md` at project root with the summary of E2E coverage.
8. Write a detailed handoff report to your agent folder and notify me.
