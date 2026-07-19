# `browser-chatgpt-free` E2E evidence

## Automated coverage

- Provider and browser-driver tests cover batch mission construction, sticky
  continuation, compact tool schemas, typed failures, and compatibility SSE.
- `npm run live:chatgpt` is the only command that promotes ChatGPT to default
  discovery. It first runs a fresh browser probe, then uses isolated Hermes
  configuration, a loopback relay, one cold restart, and five canaries.

## Live authenticated procedure

```bash
npm run login:chatgpt
npm run live:chatgpt
```

Sign in normally in the visible dedicated profile. Login, account selection,
2FA, and challenge handling remain manual. The runner never writes prompts,
responses, cookies, browser profiles, tokens, or screenshots to evidence.

On success it writes a private (`0600`) sanitized JSON report under
`~/.local-ai-relay/evidence/` containing environment versions, commit and
worktree hash, timestamp, mission names, durations, and failure classes only.
A failed run never promotes `browser-chatgpt-free`.
