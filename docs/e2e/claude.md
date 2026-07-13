# browser-claude-free — End-to-End Evidence

## Status

**Implementation complete. Driver plumbing smoke PASS. Live authenticated E2E PENDING.**

The Claude driver (`src/browser/claude-driver.ts`), provider adapter
(`src/providers/claude-browser.ts`), CLI dispatch (`--provider claude`),
and unit tests are in place. `npm test`, `npm run build`, and
`npm run smoke:startup` pass from a clean checkout.

A driver-plumbing smoke (`npm run smoke:claude-driver`) loads the live
`https://claude.ai/` site in headless Chromium with an isolated, empty
profile and confirms the driver throws `BrowserFailure { kind: 'login_required' }`
when the landing-page sign-in button is visible. This verifies URL/selector
loading and the `assertNotBlocked` path against the real site. It does NOT
verify composer interaction, send-button readiness, response extraction, or
completion detection — those require an authenticated Claude.ai session.

`browser-claude-free` is NOT yet registered in `src/providers/registry.ts`
or advertised in `/v1/models`. Per project policy, registration happens
only after the live authenticated E2E run below passes and is recorded
here.

## Driver plumbing smoke — PASS

- Command: `npm run smoke:claude-driver`
- Environment: headless Linux container, Node v24.18.0, Playwright Chromium 149.0.7827.55
- Profile: fresh empty profile under `~/.local-ai-relay/browser-profiles/claude`
- Result: `BrowserFailure kind=login_required: Claude is showing its landing page with a sign-in button.`
- Conclusion: driver loads, navigates to claude.ai, detects unauthenticated state, throws typed failure, closes cleanly.

## Required live verification

These steps MUST run on a machine with a visible graphical browser session
and an authenticated Claude.ai account. They cannot run inside a headless
CI container.

| Step | Command | Expected outcome |
|---|---|---|
| 1. Install + unit tests + build + smoke | `./setup-linux.sh --no-browser` | All pass; smoke selects a free port and `/health` responds. |
| 2. Open dedicated Claude profile | `npm run login:claude` | Visible Chromium opens with the isolated profile under `~/.local-ai-relay/browser-profiles/claude`. |
| 3. Normal sign-in | (manual, in the browser) | User signs in to `https://claude.ai` normally. No cookies, tokens, or passwords are pasted into the relay. |
| 4. Live probe | `npm run probe:claude` | Probe waits for the composer, sends the harmless marker prompt, and prints `PASS: Claude submission, completion detection, and response extraction worked.` along with the conversation URL. |
| 5. Register provider | (manual edit to `src/providers/registry.ts`) | Add `ClaudeBrowserProvider` to the providers list. Re-run `npm run build`. |
| 6. Hermes configuration | `npm run hermes:configure` | `/model` lists `custom:local-ai-relay:browser-claude-free`. |
| 7. Ordinary completion | New Hermes session, `custom:local-ai-relay:browser-claude-free`, prompt: "Return three prioritized improvements." | Assistant returns a coherent non-empty answer. |
| 8. Tool round trip | New Hermes session, selector above, agent task that triggers `terminal { command: "pwd" }` | Claude emits a `<relay_tool_calls>` envelope, relay translates to OpenAI `tool_calls`, Hermes executes `pwd`, relay continues the thread with the tool result, Claude returns a final answer referencing the working directory. |
| 9. SSE | Same as step 7 with `stream: true` (Hermes default) | Chunks reconstruct the full response; stream terminates with `data: [DONE]`. |

## Failure handling to verify explicitly

- **Login page:** if the profile is signed out, the driver throws
  `BrowserFailure { kind: 'login_required' }` instead of silently
  navigating to a non-chat surface.
- **Rate limit / quota:** if Claude shows a usage-limit banner, the driver
  throws `BrowserFailure { kind: 'rate_limit' | 'quota_exhausted' }`.
- **CAPTCHA:** if a Cloudflare/CAPTCHA challenge appears, the driver
  throws `BrowserFailure { kind: 'captcha' }`. The relay never attempts
  to solve it.
- **Layout change:** if the composer selector no longer matches, the
  driver throws `BrowserFailure { kind: 'layout_changed' }` with an
  actionable message rather than clicking the wrong element.

## Recording evidence

After the live run passes, replace this section with:

- Operating system and Node version
- Relay port
- Hermes selector used
- Verbatim PASS markers from the probe and E2E
- Sanitized conversation URLs (no tokens, no auth query params)
- The exact assistant text from the ordinary completion
- The exact tool-call envelope and the final answer from the tool round trip

Do NOT record cookies, session tokens, OAuth codes, request headers, or
browser HTML. Screenshots stay local under `~/.local-ai-relay/diagnostics/`
and are not committed.

## Patchright baseline review — code PASS, authenticated E2E pending

The shared runtime changed from Playwright 1.61.1 to Patchright 1.61.1 with
real Chrome selected through `channel: "chrome"` when auto-detected. The review
workspace passed 122/122 tests, TypeScript build, and startup smoke. No local
diagnostic screenshots were present. The only recorded Claude failure remains
the expected empty-profile `login_required`; no detection-related Claude
failure has been observed. Authenticated Claude E2E was not rerun here, so the
provider remains unregistered.

`./verify-all.sh` completed its non-browser stage after the runtime change,
including all tests, build, and startup smoke. Its authenticated stage could
not start in the review workspace because no graphical TTY or signed-in
profile was available. Patchright's managed-browser download was also blocked
by the workspace network, so the earlier live-site smoke was not repeated.
