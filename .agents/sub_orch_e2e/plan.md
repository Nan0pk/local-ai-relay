# E2E Test Suite Implementation Plan

## Objective
Design and implement a comprehensive, opaque-box, requirement-driven E2E test suite for the `local-ai-relay` project, covering 60+ test cases across 4 tiers.

## Feature under test
- Feature 1: Chat Completion routing and models list (OpenAI compatibility)
- Feature 2: Browser session management / session persistence
- Feature 3: Tool-calling / function-calling bridge
- Feature 4: Login automation (SSO automation / shared profile)
- Feature 5: Provider specific completions (including login-free Arena.ai and other registered providers)

## Design Decisions
1. **Mock Browser Sandbox**:
   - Create `src/browser/mock-browser.ts` implementing mock `BrowserContext`, `Page`, and `Locator` matching Playwright's API.
   - Inject the mock browser in `src/browser/runtime.ts` when `process.env.RELAY_MOCK_BROWSER === 'true'`.
   - The mock page generates responses based on "triggers" in the input prompt (e.g., `trigger:login`, `trigger:captcha`, `trigger:rate_limit`, `trigger:empty_response`, or tool calls with a nonce).
2. **Interface Stubs**:
   - Add a stub/no-op implementation of `BaseBrowserDriver.handleSsoLogin(page: Page): Promise<boolean>` to `src/browser/base-driver.ts`.
   - Add `src/browser/context-manager.ts` implementing `BrowserContextManager` singleton stub.
   - This ensures the codebase compiles, and E2E tests can verify the interface contracts.
3. **E2E Test File**:
   - Create `tests/e2e/e2e.test.ts` covering 60 test cases (T1: 25, T2: 25, T3: 5, T4: 5) using Node.js native test runner and Fastify in-process HTTP requests.
4. **Scripts Integration**:
   - Add `"test:e2e": "node --import tsx --test tests/e2e/e2e.test.ts"` to `package.json`.
   - Add `npm run test:e2e` to the main `"test"` script or document it in `TEST_INFRA.md` / `TEST_READY.md`.

## Decomposition & Dispatch Steps
- **Step 1**: Dispatch a `teamwork_preview_worker` to write the mock browser sandbox, stubs, E2E test suite, and scripts in the workspace.
- **Step 2**: The worker will run `npm test` and `npm run test:e2e` to verify all tests pass.
- **Step 3**: The worker will generate `TEST_INFRA.md` and `TEST_READY.md` in the project root.
- **Step 4**: Collect and verify the worker handoff, ensure 100% success, and compile our final handoff.
