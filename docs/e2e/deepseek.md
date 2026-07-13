# browser-deepseek-free — End-to-End Evidence

## Status

**Implementation complete. Live authenticated E2E PENDING.**

Driver: `src/browser/deepseek-driver.ts` (extends `BaseBrowserDriver`).
Adapter: `src/providers/deepseek-browser.ts`. Tests: 9/9 pass via the shared
browser-provider test matrix. CLI: `npm run login:deepseek`, `npm run
probe:deepseek`.

`browser-deepseek-free` is NOT registered in `src/providers/registry.ts` or
`/v1/models` until the live authenticated E2E below passes and is
recorded here.

## Required live verification

Run on a machine with a visible graphical browser session and an
authenticated DeepSeek account:

```bash
cd ~/local-ai-relay   # (or %HOME%\local-ai-relay on Windows)
git pull --ff-only
npm ci                 # npm install on Windows
npm run login:deepseek   # sign in to chat.deepseek.com normally, Ctrl+C when composer visible
npm run probe:deepseek   # prints PASS + conversation URL
```

Paste back the `PASS:` line and `Conversation:` URL. After PASS, the
provider is registered in `registry.ts`, this file is filled with
sanitized evidence, and the README status flips to "E2E verified".
