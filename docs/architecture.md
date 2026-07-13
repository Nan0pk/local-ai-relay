# Architecture

Architecture decisions: [ADR 0001 — Patchright browser runtime](adr/0001-patchright-browser-runtime.md).

## Request path

```text
Hermes / OpenAI client
        │
        ▼
Fastify routes ──► provider registry ──► selected provider
        │                                  │
        │                         ┌────────┴────────┐
        │                         │                 │
        ▼                         ▼                 ▼
OpenAI JSON/SSE              local/API         browser driver
                                                  │
                                                  ▼
                                      user-authenticated webchat
```

Routes never select sites directly. The registry is the only model-to-provider
mapping, so unknown or unfinished models cannot silently bypass checks or fall
back to another service.

## Source ownership

| Path | Responsibility |
|---|---|
| `src/routes/` | Validate and expose the OpenAI-compatible HTTP surface |
| `src/providers/registry.ts` | Register only implemented providers and index model IDs |
| `src/providers/*-browser.ts` | Convert OpenAI requests into provider-neutral browser missions |
| `src/providers/conversation-planner.ts` | Full first turn, delta continuations, fork detection |
| `src/providers/tool-bridge.ts` | Compact tool definitions and translate tagged tool calls |
| `src/browser/types.ts` | Site-independent browser driver contract |
| `src/browser/runtime.ts` | Patchright launch policy and Chrome/Chromium selection |
| `src/browser/*-driver.ts` | Site-specific page interaction and response extraction |
| `src/hermes/` | Preserve and update Hermes configuration |
| `src/service/` | Generate the systemd user unit |
| `src/startup/` | Select/reuse a safe local port |

As more adapters land, site-specific drivers remain in `src/browser/`, while
shared planning, tool translation, OpenAI shaping, and routing stay outside
them. A provider is not registered until live validation succeeds.

## Browser conversation flow

1. The planner creates a full batch mission for a new or forked conversation.
2. Tool definitions are compacted and included on the first turn only.
3. A continuation sends only new messages; the existing website thread holds
   prior context and tools.
4. The driver enters text with native Patchright/Playwright-compatible keyboard input, waits for an
   enabled send control, and waits for the final assistant message to stabilize.
5. Tagged tool requests are translated into OpenAI `tool_calls`.
6. JSON is returned normally, or reconstructed as OpenAI-compatible SSE when
   the client requested `stream: true`.

Browser operations are serialized per running relay because consumer webchats
are stateful and rate-limited. Profiles are isolated under
`~/.local-ai-relay/browser-profiles/` and never exported.

## Trust boundary

- The relay binds to loopback by default.
- Browser login remains visible and user-controlled.
- Passwords, cookies, session tokens, and browser HTML are never requested or
  printed to logs.
- Diagnostics remain local and must be redacted.
- No adapter may bypass the registry, CAPTCHA, rate limits, access controls, or
  provider safety systems.

## Intentional limitations

- Browser SSE is compatibility streaming after the website response completes,
  not upstream token streaming.
- Browser selectors can change without notice.
- There is no bearer-token middleware or multi-user isolation yet.
- There is no persistent request database or remote telemetry.
