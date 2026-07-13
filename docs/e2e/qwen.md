# browser-qwen-free — End-to-End Evidence

## Status

**Implementation complete. Live authenticated E2E PENDING.**

Driver: `src/browser/qwen-driver.ts` (extends `BaseBrowserDriver`).
Adapter: `src/providers/qwen-browser.ts`. Tests: 9/9 pass via the shared
browser-provider test matrix. CLI: `npm run login:qwen`, `npm run
probe:qwen`.

`browser-qwen-free` is NOT registered in `src/providers/registry.ts` or
`/v1/models` until the live authenticated E2E below passes and is
recorded here.

## Required live verification

Run on a machine with a visible graphical browser session and an
authenticated Qwen account:

```bash
cd ~/local-ai-relay   # (or %HOME%\local-ai-relay on Windows)
git pull --ff-only
npm ci                 # npm install on Windows
npm run login:qwen   # sign in to chat.qwen.ai normally, Ctrl+C when composer visible
npm run probe:qwen   # prints PASS + conversation URL
```

Paste back the `PASS:` line and `Conversation:` URL. After PASS, the
provider is registered in `registry.ts`, this file is filled with
sanitized evidence, and the README status flips to "E2E verified".

## Patchright baseline review — code PASS, authenticated E2E pending

Patchright 1.61.1 now supplies the shared Chromium runtime; 122/122 tests,
TypeScript build, and startup smoke pass. No local diagnostics or recorded
Qwen failures were available, so no detection-related fix is claimed.
Authenticated E2E remains required and the provider remains unregistered.
