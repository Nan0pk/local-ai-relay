# Security Policy

## Threat model

`local-ai-relay` is a local-first HTTP server that exposes an
OpenAI-compatible endpoint. The primary assets at risk are:

1. **Provider credentials** — API keys for upstream LLM providers, when
   real providers land in milestone 2. These must never leave the user's
   environment.
2. **Request contents** — prompts and completions flowing through the
   relay. These may contain sensitive user data.
3. **The relay process itself** — an attacker who can reach the relay can
   consume the user's provider quota or read prompts.

In milestone 1 there are no real credentials in play — the mock provider
has no secrets. The rules below are forward-looking and apply from day one
so later milestones don't introduce regressions.

## Secret handling

- **No secrets in the repo.** `.gitignore` excludes `.env`, `*.pem`,
  `*.key`, `secrets/`, and any path matching `*token*` or `*credentials*`.
  `.env.example` is the only env-shaped file allowed in the tree.
- **Credentials come from the environment.** Real providers (milestone 2+)
  read keys from `process.env` only. No file-based key stores, no embedded
  defaults.
- **No credential echo in logs.** Provider keys must never appear in
  request logs. When request/response logging lands, redact headers and
  any field matching `/key|token|auth|secret/i`.
- **No credential forwarding.** The relay sends credentials only to the
  upstream provider that requires them. It never forwards keys to a
  third party, a telemetry endpoint, or another client.

## No provider bypass

Every request — including internal, debug, or admin requests — must route
through the provider registry in `src/providers/registry.ts`. Specifically:

- No hardcoded upstream URL reachable outside the registry.
- No `if model === 'debug'` shortcut that skips the `Provider` interface.
- No path that lets a client reach an upstream without passing through
  `routes/chat.ts` → `findProviderForModel()` → `provider.complete()`.

This is the single most important security property of the relay: it
guarantees auth, logging, and rate limiting can be added in one place and
cannot be silently skipped.

## Network surface

- The relay binds to `127.0.0.1` by default. Binding to `0.0.0.0` requires
  an explicit `HOST=0.0.0.0` env override and is discouraged.
- Milestone 1 has no auth middleware. Do not expose the relay to a network
  until milestone 4 (auth) lands.
- Outbound TLS to real providers is a milestone 2 concern and will use the
  provider SDK's defaults; no custom CA bundles or `NODE_TLS_REJECT_UNAUTHORIZED`
  overrides.

## Reporting a vulnerability

Until a security contact is published, please open a private GitHub Security
Advisory at https://github.com/Nan0pk/local-ai-relay/security/advisories/new.

Do not open a public issue for security reports.

## Scope

This policy covers the `local-ai-relay` source tree only. It does not
cover third-party provider SDKs, the user's browser session (relevant to
milestone 5), or the user's operating system.
