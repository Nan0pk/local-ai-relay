# browser-minimax-m3 — End-to-End Evidence

## Status

**Implementation complete. Live authenticated E2E PENDING.**

Driver: `src/browser/minimax-driver.ts` (extends `BaseBrowserDriver`).
Adapter: `src/providers/minimax-browser.ts`. Tests: 9/9 pass via the shared
browser-provider test matrix. CLI: `npm run login:minimax`, `npm run
probe:minimax`.

`browser-minimax-m3` is registered in the diagnostic inventory. It appears in
the default `/v1/models` response only while current live evidence exists.

## Required live verification

Run on a machine with a visible graphical browser session and an
authenticated MiniMax account:

```bash
cd ~/local-ai-relay   # (or %HOME%\local-ai-relay on Windows)
git pull --ff-only
npm ci                 # npm install on Windows
npm run login:minimax   # sign in to agent.minimax.io normally, Ctrl+C when composer visible
npm run probe:minimax   # prints PASS + conversation URL
```

Paste back the `PASS:` line and `Conversation:` URL. After PASS, this file is
filled with sanitized evidence and current runtime readiness becomes available.

## Patchright baseline review — code PASS, authenticated E2E pending

Patchright 1.61.1 now supplies the shared Chromium runtime; 122/122 tests,
TypeScript build, and startup smoke pass. No local diagnostics or recorded
MiniMax failures were available, so no detection-related fix is claimed.
Authenticated E2E remains required before the adapter can be called ready.
