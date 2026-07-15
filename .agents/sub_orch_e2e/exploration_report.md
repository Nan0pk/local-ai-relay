# Technical Exploration Report: local-ai-relay Architecture & E2E Testing Design

This report explores the `local-ai-relay` codebase to answer core architecture questions in preparation for designing and implementing the End-to-End (E2E) test suite.

---

## 1. Registered Providers and Models (`src/providers/registry.ts`)

The central provider registry mapping OpenAI-compatible model IDs to specific relay backends is defined in `src/providers/registry.ts`.

### Observations
* **File Path**: `src/providers/registry.ts`
* **Registered Providers**:
  - `MockProvider` (instantiated at line 17)
  - `ChatGptBrowserProvider` (instantiated at line 18)
  - `GeminiBrowserProvider` (instantiated at line 19)
* **Active Providers List** (line 22):
  ```typescript
  const providers: Provider[] = [mockProvider, chatGptBrowserProvider, geminiBrowserProvider];
  ```

### Models List per Provider
1. **`MockProvider`** (`src/providers/mock.ts`, lines 21–34):
   - `mock-gpt-4o-mini` (Mock GPT-4o Mini)
   - `mock-gpt-4o` (Mock GPT-4o)
2. **`ChatGptBrowserProvider`** (`src/providers/chatgpt-browser.ts`, line 12):
   - `browser-chatgpt-free`
3. **`GeminiBrowserProvider`** (`src/providers/gemini-browser.ts`, line 8):
   - `browser-gemini-free`

*Note: While there are browser drivers for other sites (Claude, DeepSeek, Z.ai, Minimax, Kimi, Qwen, Grok, Mistral) in `src/browser/`, they are currently only exposed via the command-line interface for login and manual probing. Only Mock, ChatGPT-browser, and Gemini-browser are registered in the main registry and thus exposed to clients via the `/v1/chat/completions` API.*

---

## 2. ChatGPT and Gemini Browser Provider Implementation & Driver Interaction

The ChatGPT and Gemini browser providers act as adapters that map OpenAI completion requests to the low-level Playwright/Patchright browser drivers.

### ChatGPT Provider (`src/providers/chatgpt-browser.ts`)
* **Model ID**: Registers `browser-chatgpt-free`.
* **Driver Class**: Instantiates and interacts with `ChatGptPlaywrightDriver` (`src/browser/chatgpt-driver.ts`).
* **Metadata Advertised** (lines 31–37):
  - Transport: `browser`
  - Execution style: `batch`
  - Supports sessions: `true`
  - Supports streaming: `false` (streaming is simulated at the API boundary, see `src/routes/chat.ts`)
  - Max parallel requests: `1`

### Gemini Provider (`src/providers/gemini-browser.ts`)
* **Model ID**: Registers `browser-gemini-free`.
* **Driver Class**: Instantiates and interacts with `GeminiPlaywrightDriver` (`src/browser/gemini-driver.ts`).
* **Metadata Advertised** (line 21): Identical to ChatGPT metadata (`transport: 'browser'`, `execution_style: 'batch'`, etc.).

### Driver Interaction Protocol
The providers interact with their drivers purely through the `BrowserChatDriver` interface (`src/browser/types.ts`):
```typescript
export interface BrowserChatDriver {
  send(request: BrowserChatRequest): Promise<BrowserChatResult>;
  close(): Promise<void>;
}
```

1. **Planning**: The provider passes incoming messages to the `ConversationPlanner` (`src/providers/conversation-planner.ts`) which returns a `prompt` (either the full batch or delta continuation) and flags (`sessionId`, `resetSession`).
2. **Execution**: The provider invokes `driver.send({ prompt, resetSession, sessionId, signal })`.
3. **Low-level Driver Execution Flow** (`src/browser/base-driver.ts`, lines 140–152 & `sendOnPage`):
   - Runs actions inside a `SerialQueue` to serialize requests.
   - Retrieves or creates the corresponding browser page (`pageFor(sessionId, resetSession)`).
   - Verifies the state is not blocked (not showing CAPTCHA or Login page).
   - Waits for the composer DOM element to become visible and usable.
   - Clear existing text and enters the new prompt.
   - Clicks the send button (utilizing `forceClick` if configured) or fallback to pressing Enter.
   - Waits for the assistant message locator list count to increase.
   - Wait until message text is stable (no modification for `stableMs` window).
   - If a failure happens, takes a diagnostic screenshot and records page metadata.
4. **Tool Parsing**: The provider passes the response string to the tool bridge (`parseBrowserResponse`) to extract XML tool calls.
5. **Session Update**: The provider logs the assistant response to the planner via `plan.remember(...)` so subsequent turns contain updated history.

---

## 3. Tool-Calling and Function-Calling Bridge (`src/providers/tool-bridge.ts`)

The tool-calling bridge is the component that converts OpenAI JSON-based tool definitions into instructions digestible by raw web-chat interfaces and parses back structured tool-call arguments from completion texts.

### Lifecycle of a Tool Call Request
1. **Creation**: `createToolBridgeContext(tools, toolChoice)` initializes verification data and a unique `nonce` (UUID) for the turn.
2. **Pruning**: It minifies the tool schemas via `minifyTool()` to prevent blowing up the model's context window. It truncates function descriptions to 150 characters and parameter properties descriptions to 100 characters.
3. **Instruction Injection**: `toolInstructions()` formats instructions appended to the user prompt. It formats the minified tool list as a JSON string and instructs the model:
   - To return tool calls inside a request-specific XML/HTML envelope: `<relay_tool_calls nonce="[nonce]">...JSON array...</relay_tool_calls>`.
   - The arguments inside the JSON array must follow the specified JSON schema.
   - If no tool is needed (under `auto`), it must answer normally.

### Response Parsing and Validation
When the browser completes the output, `parseBrowserResponse(text, context)` executes:
1. **Envelope Extraction**: It locates `<relay_tool_calls nonce="[nonce]">` and the matching `</relay_tool_calls>`.
   - If the tag is opened but not closed, it throws `BrowserFailure('invalid_tool_call', ...)`.
   - If no tag is present and `tool_choice` is required, it throws `BrowserFailure('invalid_tool_call', ...)`.
   - If tags are found but no tools were offered or `tool_choice === 'none'`, it throws an error.
2. **JSON Parsing**: Strips any markdown formatting (e.g. ` ```json `) inside the envelope and parses the text as a JSON array.
3. **Function Validation**: For each tool call:
   - Validates that the requested name exists in the offered tools.
   - Validates the JSON arguments against the tool's JSON Schema using **Ajv** compiled validators (`ajv.compile(...)`). If validation fails, it throws a `BrowserFailure('invalid_tool_call', ...)`.
   - Generates/assigns a unique ID (`call_browser_[index]_[uuid]`) to satisfy the client harness.
4. **Content Sanitization**: It strips the envelope and JSON contents entirely from the final output message. The text before the tag and the text after the tag are concatenated.

---

## 4. Session Management and Session Persistence

`local-ai-relay` supports stateful multi-turn conversations by mapping HTTP headers to browser automation tabs.

### HTTP Routing (`src/routes/chat.ts`)
The server extracts the `x-relay-session` header:
```typescript
const rawSessionId = req.headers['x-relay-session'];
const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
```
If present, this `sessionId` is passed into the provider's `complete` request options.

### Context Preservation (`src/providers/conversation-planner.ts`)
The `ConversationPlanner` manages session history:
* Maintains an in-memory session cache of message lists: `this.sessions: Map<string, SessionState>`.
* **Planning (Optimization)**: When a request is made, it checks:
  1. Does `sessionId` exist in the cache?
  2. Does the incoming message history begin with the cached history?
  3. Are the system instructions identical?
* **Continuation**: If matching, `resetSession` is `false`, and it sends only the *new* message delta inside a `CONTINUE BATCH MISSION` envelope. This avoids re-submitting massive historical prompts to the browser.
* **Mismatched History / Reset**: If history diverges, `resetSession` is set to `true` to clear the browser tab.

### Browser Tab Isolation (`src/browser/base-driver.ts`)
The driver implements session persistence:
* Maintains a mapping of active page tabs: `this.pages = new Map<string, Page>()`.
* **Reusing Tabs**: If `sessionId` is provided and `resetSession` is `false`, the driver locates the cached `Page` in `this.pages` and runs the query on that tab.
* **Resetting Tabs**: If `resetSession` is `true`, it closes the existing page tab, deletes it, and opens a new tab navigating to the provider homepage.
* **Isolating Tabs**: A maximum of 8 active sessions (`RELAY_BROWSER_MAX_SESSIONS`) are kept concurrently. When exceeded, the oldest tab is closed and evicted.
* **Storage/Cookie Sharing**: All tabs run inside the *same* `BrowserContext` (`launchPersistentRelayContext`). This means they share the same browser profile, local storage, and cookie store. Sessions are isolated at the **Tab/Page** level (they don't see each other's chats), but they share the same authenticated user profile (you log in once, and all tabs share that logged-in state).
* **Stateless Fallback**: If no `sessionId` is provided, a random temporary ID is used and the page is closed immediately upon completion of the request.

---

## 5. Login and SSO Automation Features

There is **no automated SSO logic, credential typing, or Google SSO integration** in the codebase. Instead, the application relies entirely on **interactive user sign-in** using headful browsers, persisting the session state inside a local browser profile folder.

### Key Login Workflow
1. **Interactive CLI** (`src/cli/browser-login.ts`):
   - The user runs `npm run login:[provider]` (e.g. `npm run login:gemini`).
   - The script resolves the provider and instantiates its driver in headful mode (`headless: false`).
   - It calls `driver.openForLogin()`, which launches the browser pointing to the site URL and brings it to the front.
   - The user signs in manually (completing credentials, 2FA, Google SSO, or email/passwords).
   - Once the UI composer becomes available, the user returns to the CLI and stops the process (Ctrl+C).
2. **Ready Detection** (`src/browser/base-driver.ts`, lines 163–175):
   - `BaseBrowserDriver.waitUntilReady()` polls the page until `isComposerUsable(composer)` returns true, confirming login succeeded and the user is on the main chat surface.
3. **Persistent Profiles** (`src/browser/runtime.ts`):
   - The browser profile is persisted in `~/.local-ai-relay/browser-profiles/[provider_name]`.
   - On subsequent launches (even in headless mode in a background service), the browser context loads this user profile. Therefore, cookies and SSO login state remain valid and cached without needing automated re-authentication.
4. **Login Redirection / Assertion** (`src/browser/base-driver.ts`, lines 330–346):
   - When completing an API request, `assertNotBlocked(page)` checks if the current URL matches `loginUrlPattern` or if buttons with `signInButtonLabels` are visible:
     - **ChatGPT**: `loginUrlPattern: /\/login|\/auth\/|\/sign_?in/i`, `signInButtonLabels: ['Sign in', 'Log in', 'Get started']`.
     - **Gemini**: `loginUrlPattern: /accounts\.google\.com|\/signin|\/login|\/v3\/signin/i`, `signInButtonLabels: ['Sign in', 'Log in', 'Use Gemini']`.
   - If matching, it throws a typed `BrowserFailure('login_required', ...)` error which maps to a `401 Unauthorized` HTTP error, alerting the developer that they need to run `npm run login:[provider]`.

---

## 6. Test Suite Structure and Execution

The test suite is structured to separate Fastify routing/error-mapping tests from browser-dependent driver tests.

### Test Runner
* Tests are executed using Node's built-in test runner: `node --import tsx --test src/*.test.ts src/**/*.test.ts` (triggered by `npm test`).
* Standard Node assertions: `import assert from 'node:assert/strict';`.
* Structuring utilities: `import test, { describe } from 'node:test';`.

### Unit Test Architecture
To keep tests fast, reliable, and runnable in sandboxed environments (such as CI) without requiring real browser instances or external accounts, the unit tests utilize mocks:

1. **HTTP Routing & Mapping Tests** (`src/routes-chat.test.ts`):
   - Mocks the provider registry by injecting a `FailingBrowserProvider` which throws specific `BrowserFailure` errors on demand.
   - Uses Fastify's `app.inject(...)` to simulate raw HTTP requests and asserts that standard codes (e.g. `login_required`, `rate_limit`, `captcha`) correctly return their mapped HTTP statuses (e.g. 401, 429, 403) and OpenAI-compatible JSON error formats.
   - Validates that streaming endpoints (`stream: true`) correctly chunk outputs and end with raw `data: [DONE]` events.
2. **Browser Driver Core Tests** (`src/browser/base-driver.test.ts`):
   - Tests features like composer element usability, selector prioritization, and response stability detection.
   - Instantiates a mock Page and Locator object that returns fake HTML/visibility states. This allows testing `BaseBrowserDriver`'s internal helper methods synchronously without initializing Playwright or opening a browser profile.
3. **Shared Provider Test Matrix** (`src/providers/browser-provider-test-matrix.ts`):
   - Defines a unified set of 9 scenario tests covering listModels, tool-call injection, XML envelope parsing, multi-tool-calls, sessions, rate limits, and SSE compatibility.
   - Any new browser provider test file (e.g. `src/providers/chatgpt-browser.test.ts`, `src/providers/gemini-browser.test.ts`) simply imports `runBrowserProviderTestMatrix` and runs the suite against a mock driver (`FakeDriver`), ensuring absolute behavioral consistency across all provider adapters.
