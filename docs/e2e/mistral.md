# browser-mistral-free — End-to-End Evidence

## Status

**Implementation complete. Live authenticated E2E PENDING.**

Driver: `src/browser/mistral-driver.ts` (extends `BaseBrowserDriver`).
Adapter: `src/providers/mistral-browser.ts`. Tests: 9/9 pass via the shared
browser-provider test matrix. CLI: `npm run login:mistral`, `npm run
probe:mistral`.

`browser-mistral-free` is registered in the diagnostic inventory. It appears
in the default `/v1/models` response only while current live evidence exists.

## Required live verification

Run on a machine with a visible graphical browser session and an
authenticated Mistral account:

```bash
cd ~/local-ai-relay   # (or %HOME%\local-ai-relay on Windows)
git pull --ff-only
npm ci                 # npm install on Windows
npm run login:mistral   # sign in to chat.mistral.ai normally, Ctrl+C when composer visible
npm run probe:mistral   # prints PASS + conversation URL
```

Paste back the `PASS:` line and `Conversation:` URL. After PASS, this file is
filled with sanitized evidence and current runtime readiness becomes available.

## Patchright baseline review — code PASS, authenticated E2E pending

Patchright 1.61.1 now supplies the shared Chromium runtime; 122/122 tests,
TypeScript build, and startup smoke pass. No local diagnostics or recorded
Mistral failures were available, so no detection-related fix is claimed.
Authenticated E2E remains required before the adapter can be called ready.
