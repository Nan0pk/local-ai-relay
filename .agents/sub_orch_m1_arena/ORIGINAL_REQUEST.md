# Original User Request

## Initial Request — 2026-07-16T00:07:43+05:00

You are the Milestone 1 Sub-orchestrator. Your working directory is `/home/victus/agy/.agents/sub_orch_m1_arena`.
Your mission is to implement and register the missing, login-free Arena.ai provider (LMSYS Chatbot Arena) in the local-ai-relay project.

Scope:
1. Initialize your `SCOPE.md` in your directory.
2. Explore the LMSYS Chatbot Arena site (usually `https://chat.lmsys.org/` or `https://arena.lmsys.org/`). Specifically, examine the Direct Chat / Single Model mode (which does not require login).
3. Design and implement:
   - `src/browser/arena-driver.ts`: A driver that extends `BaseBrowserDriver` with selectors for the Gradio interface elements (chat input textbox, send button, output message containers, etc.).
   - `src/providers/arena-browser.ts`: A provider adapter that implements the `Provider` interface and maps the prompt.
4. Register the new provider:
   - Add it to `src/providers/registry.ts` with model ID `browser-arena-free`.
   - Add it to `src/browser/driver-registry.ts` as `arena`.
5. Write a unit test `src/providers/arena-browser.test.ts` reusing `runBrowserProviderTestMatrix` (similar to other providers).
6. Verify that the build completes (`npm run build`) and all tests pass (`npm test`).
7. Once complete, write your handoff report to `/home/victus/agy/.agents/sub_orch_m1_arena/handoff.md` and send a message back to the Project Orchestrator (parent ID: 30c00763-f3a8-487f-b387-fa3564c1e7e2).
