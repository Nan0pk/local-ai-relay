# North Star

## One sentence

Local-first relay that gives agent harnesses a single OpenAI-compatible
endpoint, with backends that can be API providers, local models, or browser
chat bridges — without leaking credentials to a third party.

## Who it's for

- Developers running agent harnesses (Claude Code, Cursor, custom LangChain /
  LlamaIndex apps) who want one stable `OPENAI_BASE_URL` regardless of which
  backend serves the request today.
- Users who can't or won't paste provider API keys into a hosted proxy.
- Tinkerers who want to drive browser-based chat UIs (ChatGPT, Claude.ai,
  Gemini) as if they were OpenAI API endpoints, with the browser as the
  trusted credential holder.

## What "local-first" means here

1. The relay process runs on the user's machine. No SaaS deployment is
   required and none is planned as the primary surface.
2. Credentials live in the user's environment (`env`, OS keychain, or a
   browser session the user controls). The relay never phones home and never
   forwards keys to a third party.
3. All telemetry is opt-in and local-first (logs to stdout by default).

## What it is NOT

- **Not a hosted proxy.** There will be no `relay.example.com`. Deploying it
  yourself is fine; we won't operate it for you.
- **Not a key vault.** The relay reads credentials from the environment; it
  does not store them.
- **Not a provider bypass.** Every request goes through the provider
  registry. There is no hidden path that lets a client reach an upstream
  directly, bypassing auth, logging, and rate limits.
- **Not a browser automation framework.** Browser-bridged providers are a
  later milestone and will use a real automation library; the relay itself
  stays a thin HTTP server.

## Success criteria for milestone 1 (current)

- `npm install && npm run build && npm start` works on a clean checkout.
- `GET /health`, `GET /v1/models`, `POST /v1/chat/completions` return
  OpenAI-shaped responses.
- An OpenAI-compatible client (e.g. `openai` npm package with `baseURL`
  pointed at the relay) can list models and get a chat completion without
  errors.
- No secrets required to run; no secrets committed; no provider-bypass code
  paths.

## Success criteria for later milestones (preview — see roadmap)

- Real API provider (e.g. OpenAI or Anthropic) registered behind the same
  surface, keys read from env only.
- Streaming (`stream: true`) supported end-to-end.
- Browser-bridged provider for one chat UI, using a real automation library,
  with the browser session as the credential holder.
