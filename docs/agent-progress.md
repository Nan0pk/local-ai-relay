# Agent Progress - local-ai-relay

## Current Objective
Verify and register the Gemini browser provider, fix the word-count-based generation interruption bug that breaks short answers, update systemd and Hermes configurations, and ensure the entire E2E workflow is verified and operational.

## Completed Work
1. **Rebase & Merge**: Safely merged `origin/main` into the feature branch `feature/register-gemini-and-fix-short-answers` and resolved conflicts in `src/browser/base-driver.ts` and `src/browser/claude-driver.ts`.
2. **Gemini Registration**: Registered the `GeminiBrowserProvider` in the server's provider registry (`src/providers/registry.ts`), enabling `/v1/models` and completions routing to `browser-gemini-free`.
3. **Robust Short-Answer Fix**: Replaced the naive `countWords(lastText) < 3` check with a robust check that combines word-count threshold and active error detection (banners, alerts, and error keywords on the page). This allows short responses like `OK`, `BANANA`, and `42` to succeed, while retaining protection against actual generation failures or empty generations. Added comprehensive unit tests in `src/browser/base-driver.test.ts`.
4. **Improved Probe tool**: Completely rewrote `scripts/probe-all.ts` to implement proper error classification (login required, timeout, anti-bot, browser launch failure), respect configuration options, handle isolated errors per provider, and added test coverage in `src/browser/probe.test.ts`. Added `probe:all` npm script.
5. **Systemd Portability**: Verified that `setup-linux.sh` dynamically generates the systemd user service with runtime-resolved workspace paths and dependencies, ensuring complete service portability.
6. **Hermes E2E Verification**: Configured the Hermes client and verified a full round-trip from Hermes CLI to the local relay and Gemini web interface.
7. **Failure Modes Testing**: Validated behavior for malformed requests, unknown models, unauthorized states, concurrent request queuing, and service restarts.

## Files Changed
- `src/providers/registry.ts`
- `src/browser/base-driver.ts`
- `src/browser/claude-driver.ts`
- `src/browser/driver-registry.ts`
- `src/browser/probe-utils.ts` (new)
- `src/browser/base-driver.test.ts`
- `src/browser/probe.test.ts` (new)
- `src/cli/browser-login.ts`
- `src/cli/browser-login.test.ts` (new)
- `scripts/probe-all.ts`
- `package.json`

## Tests Run and Exact Results
1. `npm test`: 181 tests passed (0 failures).
2. `npm run typecheck`: Passed successfully.
3. `npm run smoke:startup`: Passed successfully.
4. E2E Hermes oneshot check:
   ```bash
   hermes -z "Reply with exactly: BANANA" --provider "custom:local-ai-relay" --model "browser-gemini-free" --accept-hooks --yolo
   ```
   **Output**: `BANANA`
5. Concurrent requests: Checked that concurrent requests are properly queued and serialized.

## Pull Request Link
https://github.com/Nan0pk/local-ai-relay/pull/4
