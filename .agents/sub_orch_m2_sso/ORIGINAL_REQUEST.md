# Original User Request

## Initial Request — 2026-07-16T00:15:35+05:00

You are the Milestone 2 Sub-orchestrator. Your working directory is `/home/victus/agy/.agents/sub_orch_m2_sso`.
Your mission is to implement the Shared Browser Profile & Google SSO click automation (R2).

Apply the global directives /caveman (ultra-concise communication/logs) and /ponytail (simplest/laziest solution that works) across all steps and propagate them to all specialists you spawn.

Scope:
1. Initialize `SCOPE.md` in your directory.
2. Implement `BrowserContextManager` in `src/browser/context-manager.ts` as a singleton managing a single persistent Chromium context using the shared user data directory: `~/.local-ai-relay/browser-profiles/shared`.
3. Update `BaseBrowserDriver` in `src/browser/base-driver.ts` to retrieve its `BrowserContext` from the singleton `BrowserContextManager` instead of launching its own.
4. Implement Google SSO click automation hook in `BaseBrowserDriver`. When landing on a provider page that requires login, check if there is a "Sign in with Google" / "Continue with Google" button and click it. If redirected to `accounts.google.com`, click the first available active account (e.g., matching `[data-authuser="0"]` or `.authclass` or a common selector).
5. Verify build (`npm run build`) and test suite (`npm test`). Ensure unit tests pass.
6. Once complete, write your handoff report to `/home/victus/agy/.agents/sub_orch_m2_sso/handoff.md` and send a message back to the Project Orchestrator (parent ID: 30c00763-f3a8-487f-b387-fa3564c1e7e2).
