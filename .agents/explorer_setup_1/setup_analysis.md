# Codebase Setup & Provider Analysis

This report documents the structural layout, provider status (R1), and browser login mechanisms (R2) for the `local-ai-relay` project, following an initial codebase investigation.

---

## 1. Project Structure and Architecture

The `local-ai-relay` repository is structured as a TypeScript/Node.js project designed to act as an OpenAI-compatible API bridge. It intercepts completion calls and executes them using browser automation via the `patchright` library.

### Core Directory Layout
*   `src/`: Primary source directory.
    *   `browser/`: Contains the browser-interaction layer.
        *   `base-driver.ts`: Declares the `BaseBrowserDriver` abstract class, which encapsulates the persistent browser context, serial queuing, stability checking, selector resolution, and generic error taxonomy mapping.
        *   `types.ts`: Holds shared driver type interfaces and the `BrowserFailure` custom error class.
        *   `runtime.ts`: Configures and launches persistent Playwright/Patchright browser contexts.
        *   `paths.ts`: Logic for detecting system Google Chrome binaries and managed fallbacks.
        *   `<provider>-driver.ts`: Site-specific drivers (e.g., `chatgpt-driver.ts`, `gemini-driver.ts`) that inherit from `BaseBrowserDriver` and supply site-specific configurations (URLs, CSS selectors, login URL regex, rate-limit text patterns).
        *   `driver-registry.ts`: Registry for known driver configurations mapped to their factories.
    *   `providers/`: Contains provider adapter logic mapping OpenAI request payloads to browser prompts.
        *   `registry.ts`: The central index of active models available via the `/v1/models` and completion endpoints.
        *   `browser-provider-test-matrix.ts`: A shared, 8-scenario unit test suite verifying tool schemas, planning, response shaping, and error boundaries uniformly across all adapters.
        *   `<provider>-browser.ts`: Adapters (e.g., `chatgpt-browser.ts`) translating OpenAI chat completions and tools into driver requests, utilizing the shared `ConversationPlanner` and `ToolBridge`.
    *   `cli/`: CLI entrypoints for downloading browsers, logging in manually (`browser-login.ts`), running E2E diagnostics (`live-probe.ts`), and configuring Hermes.
    *   `routes/`: Fastify routing endpoints for health, model listing, and completions.
    *   `server.ts` & `index.ts`: Server initialization and CLI bootloader.
*   `scripts/`: Smoke tests for verification.
*   `docs/`: Design documentation, ADRs, and per-provider E2E verification evidence files (`docs/e2e/`).

### Request Lifecycle Flow
1.  **Client Request**: Client submits a chat completion request to `/v1/chat/completions`.
2.  **Routing**: `routes/` validates the payload and invokes `findProviderForModel` from `providers/registry.ts`.
3.  **Provider Adapter**: The adapter (e.g. `ChatGptBrowserProvider`) maps the conversation history using `ConversationPlanner` to construct a concatenated batch prompt, injecting tool schemas if tools are offered.
4.  **Browser Driver**: The adapter sends the prompt to the driver. The driver executes it inside a serialized queue (`SerialQueue`) in an isolated browser profile context.
5.  **Interaction**: The driver types the text into the site's composer, clicks send, waits for the response elements, monitors stability (waiting for the stop button to disappear and the text to stop changing), and extracts the inner text.
6.  **Translation**: The adapter parses the output for any tool envelopes (e.g., `<relay_tool_calls>`), maps them to OpenAI-compatible `tool_calls` structures, and returns an OpenAI completion response.

---

## 2. Build, Test, and Run Scripts

The `package.json` contains several npm scripts supporting setup, development, testing, and operations:

*   **Build**: `npm run build` runs `tsc -p tsconfig.json` to compile TypeScript to Javascript in `dist/`.
*   **Test**: `npm test` runs node's native test runner (`node --import tsx --test`) targeting all test files under `src/`.
*   **Development**: `npm run dev` boots the server in watch mode using `tsx`.
*   **Browser Management**:
    *   `npm run browser:install`: Installs the managed browser binary if no system browser is found.
    *   `npm run browser:login`: Dispatches the login utility for ChatGPT.
    *   `npm run login:<provider>`: Launches the visible browser profile for a specific provider.
    *   `npm run probe:<provider>`: Runs a diagnostics completion task on a live site.
*   **Service & Startup**:
    *   `npm run smoke:startup`: Verifies background start.
    *   `npm run service:install`: Hooks up the systemd unit template.

### Test Execution Verification
A dry run of the test suite was executed:
*   **Command**: `npm run build && npm test`
*   **Outcome**: **PASS**
*   **Details**: 181 tests passed across 9 suites in `2832ms`. Zero failures, cancellations, or skipped tests. All unit tests successfully verify the provider mock harnesses and helper logic.

---

## 3. Provider Fleet Status (R1)

Below is the implementation status of the 10 webchat providers plus LMSYS Chatbot Arena (`arena.ai`), as defined in the R1 requirements and the codebase:

| Provider | Driver File | Adapter File | Registered in `registry.ts` | Login Required | E2E Status | Notes |
|:---|:---|:---|:---:|:---:|:---|:---|
| **ChatGPT** | `chatgpt-driver.ts` | `chatgpt-browser.ts` | **Yes** | Yes | E2E Verified | Proven reference adapter. |
| **Gemini** | `gemini-driver.ts` | `gemini-browser.ts` | **Yes** | Yes | E2E Pending | **Code is registered but E2E file is pending live verification (discrepancy).** |
| **Claude** | `claude-driver.ts` | `claude-browser.ts` | No | Yes | Implemented, pending E2E | Driver/provider fully written; pending live manual login. |
| **DeepSeek** | `deepseek-driver.ts` | `deepseek-browser.ts` | No | Yes | Implemented, pending E2E | Driver/provider fully written; pending live manual login. |
| **Z.ai** | `zai-driver.ts` | `zai-browser.ts` | No | Yes | Implemented, pending E2E | Driver/provider fully written; pending live manual login. |
| **MiniMax** | `minimax-driver.ts` | `minimax-browser.ts` | No | Yes | Implemented, pending E2E | Driver/provider fully written; pending live manual login. |
| **Kimi** | `kimi-driver.ts` | `kimi-browser.ts` | No | Yes | Implemented, pending E2E | Driver/provider fully written; pending live manual login. |
| **Qwen** | `qwen-driver.ts` | `qwen-browser.ts` | No | Yes | Implemented, pending E2E | Driver/provider fully written; pending live manual login. |
| **Grok** | `grok-driver.ts` | `grok-browser.ts` | No | Yes | Implemented, pending E2E | Driver/provider fully written; pending live manual login. |
| **Mistral** | `mistral-driver.ts` | `mistral-browser.ts` | No | Yes | Implemented, pending E2E | Driver/provider fully written; pending live manual login. |
| **Arena.ai** | *Missing* | *Missing* | No | No | Not Implemented | Completely absent from the codebase. No drivers or adapters. |

### Key Observations:
1.  **Boilerplate Completeness**: For the unregistered providers, the driver and provider code is fully fleshed out with selectors and conforms to the `BaseBrowserDriver` contract. They are unit-tested and ready for production, awaiting E2E verification.
2.  **Gemini Discrepancy**: Gemini is registered in `src/providers/registry.ts` and marked as "E2E verified" in `README.md`. However, `docs/e2e/gemini.md` explicitly lists it as `Live authenticated E2E PENDING` and notes that the E2E verification has not been completed.
3.  **Arena.ai Missing**: Arena.ai is completely missing from the codebase. There are no files under `src/browser/` or `src/providers/` targeting `arena.ai` or LMSYS Chatbot Arena.

---

## 4. Current Login & Authentication Mechanisms

Currently, `local-ai-relay` handles user authentication via isolated browser profiles:
*   Each provider has its own folder under `~/.local-ai-relay/browser-profiles/<provider-name>`.
*   Running `npm run login:<provider>` launches a visible browser instance targeting the provider's URL using that specific profile folder.
*   The user manually enters credentials, signs in, and completes 2FA.
*   Once logged in, the user presses `Ctrl+C` in their terminal to close the browser, persisting the session state (cookies, localStorage, IndexedDB) to disk.
*   During request execution, the driver runs Chromium in headless mode, loading the persistent session. If the session expires or is blocked, the driver throws `BrowserFailure { kind: 'login_required' }`.

### Challenges of the Current System:
1.  **Friction**: The user must manually log in to 10 different platforms, leading to 2FA fatigue.
2.  **Resource Inefficiency**: Since each driver manages its own browser instance and context, running multiple providers concurrently launches multiple Chromium processes, consuming massive memory and CPU.
3.  **Locking Issues**: Playwright cannot launch multiple browser contexts sharing the same user data directory concurrently. If two threads invoke the same driver or share a profile, Chromium crashes.

---

## 5. Proposed "Ingenious Login Solution" (R2)

To automate or bypass these manual login hurdles, we analyzed four potential architectural approaches:

| Approach | Description | Resource Efficiency | Security Risk | Implementation Complexity | User Friction |
|:---|:---|:---:|:---:|:---:|:---:|
| **A. Separate Profiles** | Current manual approach. | Low | Low | Low | High |
| **B. Shared Profile (Separate Browsers)** | All drivers target `~/.local-ai-relay/browser-profiles/shared`. | Low | Medium | Medium | Medium (lock issues) |
| **C. Shared Browser Daemon + SSO Automator** | Single Chromium process, shared context, automated Google/SSO clicks. | **High** | Medium | **High** | **Low** (Recommended) |
| **D. Cookie Syncing** | Copying cookies from user's main Chrome to relay sqlite. | High | **High** | High | Medium |

### Proposed Approach: Shared Browser Daemon & Google SSO Automator (Approach C)

We recommend combining a **Shared Browser Daemon** with an **SSO Click Automator**. This leverages the fact that almost all providers support Google Account (or Microsoft/GitHub) Single Sign-On. By sharing the underlying browser profile and automating OAuth redirect screens, we can achieve a single-login experience.

#### Part 1: Shared Browser Daemon (Resource & Lock Resolution)
Instead of launching separate Chromium instances per driver:
1.  Create a singleton `BrowserContextManager` in `src/browser/runtime.ts` (or as a Fastify service).
2.  The manager launches **exactly one** persistent Chromium context targeting a single shared profile directory: `~/.local-ai-relay/browser-profiles/shared`.
3.  Every driver queries the manager to obtain a page in the *same* shared context rather than launching its own.
4.  **Benefits**:
    *   Zero lock conflicts (all pages run in the same browser process).
    *   Extremely low RAM footprint (1 browser process instead of up to 10).
    *   State sharing: when you log in to Google on one page, the Google session is instantly active for all other tabs.

#### Part 2: Google SSO Automator (Authentication Bypass)
Since the Google cookies are now shared across all drivers:
1.  When a driver hits a landing page and detects a login requirement, it checks if a "Continue with Google" button is visible.
2.  If found, the driver clicks the button.
3.  Because the user has already signed in to Google (e.g., during the initial setup of Gemini or ChatGPT), the page redirects to `accounts.google.com`.
4.  The driver detects the `accounts.google.com` URL and automatically clicks the first signed-in Google account or the account matching a configured email pattern (e.g., `[data-authuser="0"]` or `.authclass`).
5.  The Google OAuth consent page redirect completes automatically, returning the user to the provider site as an authenticated user, with zero prompt entry.

#### Automated OAuth Workflow:
```
[Driver] -> Navigates to Claude -> Detects Login -> Clicks "Sign in with Google"
  v
[Page] Redirects to accounts.google.com
  v
[SSO Automator] -> Detects Google Account Selector -> Clicks primary active account
  v
[Page] Redirects back to Claude -> Logged in!
```

This reduces the manual setup phase to **one single login** (e.g., logging into Google once via `npm run login:gemini` or a setup script). The rest of the provider suite then automatically logs in on their first run.
