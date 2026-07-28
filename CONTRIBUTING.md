# Contributing

Local AI Relay accepts focused fixes and provider adapters that preserve the
project's user-safety contract.

## Before opening a pull request

```bash
npm ci
npm run verify
```

Keep production behavior free of mock output. A new browser adapter must include
deterministic fixtures, typed failure coverage, registry wiring, and an
operator-run real probe plan. Registration alone must not mark it ready.

Preserve unrelated harness settings, never automate passwords/2FA/CAPTCHA,
never copy an everyday browser profile, and redact local diagnostics.

Describe in the pull request:

- the user problem and resulting workflow;
- deterministic verification performed;
- authenticated live evidence performed or still owner-required;
- rollback or cleanup behavior;
- any provider website assumptions likely to change.

See [docs/architecture.md](docs/architecture.md) and
[docs/providers.md](docs/providers.md) before changing routing, browser, or
provider contracts.
