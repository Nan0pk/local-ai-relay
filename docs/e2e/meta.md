# `browser-meta-free` E2E evidence

## Automated coverage

- The authenticated live DOM exposes `composer-input`,
  `composer-send-button`, and `assistant-message` test IDs.
- The driver prioritizes those IDs and retains fallbacks for a future layout
  change.
- Provider matrix covers first turns, sticky continuation, tool calls, typed
  failures, response shape, batch SSE compatibility, and driver shutdown.
- Mock-browser E2E covers `/v1/models` discovery and
  `/v1/chat/completions` routing for `browser-meta-free`.

## Live authenticated result

On 2026-07-17, `npm run probe:meta` passed against an authenticated dedicated
profile on Fedora Linux. It detected the composer, submitted the harmless
`LOCAL AI RELAY READY` marker, detected completion, and extracted the expected
response.

The logged-out landing page has a disabled teaser input but no authenticated
composer. The driver ignores that input and returns `login_required` instead
of falsely reporting ready.

Run:

```bash
npm run login:meta
npm run probe:meta
```

Sign in normally in the dedicated local profile. The relay never copies or
stores Meta credentials, cookies, or tokens outside that browser profile.
