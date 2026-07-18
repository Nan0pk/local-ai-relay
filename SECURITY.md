# Security Policy

## Threat model

`local-ai-relay` is a local-first HTTP server exposing an OpenAI-compatible endpoint. The threat model covers:

1. **Malicious Browser Pages / Extensions**:
   - *Threat*: Malicious web pages or extensions running in the user's browser could attempt cross-origin requests to read completions or exhaust the user's API quota.
   - *Mitigation*: The relay enforces a loopback bearer token via the `Authorization: Bearer <token>` header on all non-liveness endpoints, alongside strict CORS origin validation which blocks arbitrary web origins.
2. **Local Processes & Multi-User Environments**:
   - *Threat*: Malicious local processes or other users on the same machine could try to access the relay or read the authentication token.
   - *Mitigation*: The relay defaults to binding to loopback (`127.0.0.1`/`localhost`), refusing non-loopback binds unless explicitly acknowledged. The bearer token is saved under the user's home directory (or temporary fallback directory) using restrictive `0o600` file permissions, preventing unauthorized local users from reading it.
3. **Diagnostics and Logs**:
   - *Threat*: The bearer token or user credentials could be leaked through console logs or diagnostic files (screenshots, failure dumps).
   - *Mitigation*: The logger is configured to redact the `Authorization` header. Screenshots capture only browser viewport snapshots, and no credential or token data is written to diagnostics.
4. **Profile Data**:
   - *Threat*: Attackers or local processes reading the persistent automation browser profile directory containing active provider web sessions.
   - *Mitigation*: The browser profile directory is stored under the user's home directory (or temporary fallback) with permissions isolated to the current OS user, and is never pointed at everyday personal browser profiles.

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
- **No web token extraction.** Browser providers rely on the local profile.
  They do not print, export, copy, or accept cookies or session tokens.
- **Dedicated profile only.** Never point Patchright at an everyday Chrome
  profile. The relay profile defaults under `~/.local-ai-relay`.

## Automation-artifact boundary

Patchright is used only to reduce false positives caused by automation
artifacts. It does not solve CAPTCHAs, rotate proxies, automate credentials,
or retry through rate limits and quota exhaustion. Those surfaces remain typed
failures requiring normal user action or waiting for the provider's limit to
reset.

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

- The relay binds to loopback (`127.0.0.1`/`localhost`) by default.
- Non-loopback binding (e.g., `0.0.0.0`) is refused unless the operator explicitly acknowledges it via `RELAY_UNSAFE_BIND_ACK=1` and configures a custom token via `RELAY_API_TOKEN`.
- Bearer token authentication is required on all API routes except the `/health` liveness probe.
- Outbound TLS to real providers is a milestone 2 concern and will use the
  provider SDK's defaults; no custom CA bundles or `NODE_TLS_REJECT_UNAUTHORIZED`
  overrides.

## Release supply chain

Mutable branches are development inputs, not trusted distribution channels.
Installation requires an exact stable release tag. The user authenticates the
tagged bootstrap asset with GitHub artifact attestation before execution;
bootstrap then authenticates the release manifest, verifier, and selected
platform archive. Attestation policy pins the repository and release-workflow
signer identity and rejects self-hosted builders. The authenticated verifier
binds the requested version, supported runtime/platform, artifact name, and
SHA-256 digest.

Missing or invalid attestation evidence, malformed metadata, unsupported input,
or a checksum mismatch aborts installation without falling back to a branch or
older download. Version activation is transactional. Failed updates and
rollback preserve the prior release, configuration, and diagnostics.

This chain trusts the user's local GitHub CLI and Node.js installations,
GitHub's release/attestation service, and the authorized repository workflow
identity. See `docs/release-policy.md` for the exact commands and unsupported
platforms.

## Browser diagnostics

On browser failure the relay writes a local screenshot by default. It can
contain prompt or response text. Diagnostics stay outside the repository and
can be disabled with `RELAY_DIAGNOSTICS=0`. DOM dumps, cookies, storage state,
and request headers are deliberately not captured.

## Reporting a vulnerability

Until a security contact is published, please open a private GitHub Security
Advisory at https://github.com/Nan0pk/local-ai-relay/security/advisories/new.

Do not open a public issue for security reports.

## Scope

This policy covers the `local-ai-relay` source tree only. It does not
cover third-party provider SDKs, the user's browser session (relevant to
milestone 5), or the user's operating system.
