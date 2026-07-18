# Current task: P0-03 — harden authentication and account selection

**Status:** Open  
**Deliverable:** One draft pull request against `main`; do not merge.

## Goal

Make the local relay safe by default without automating account choice. A normal
user must explicitly choose and authenticate an account in a visible browser,
and local API clients must authenticate with a generated bearer token.

## Required work

1. Remove or disable automatic first-account SSO selection. Keep manual,
   visible login and document how the user chooses an account.
2. Generate and persist a high-entropy loopback bearer token with restrictive
   file permissions. Never print the token in normal logs or diagnostics.
3. Require that token on relay API routes, with narrowly documented exceptions
   only if necessary for liveness.
4. Default to loopback binding. Refuse a non-loopback bind unless the operator
   supplies explicit authentication and acknowledgement.
5. Implement strict CORS/origin behavior; arbitrary web pages must not be able
   to call the relay.
6. Add focused tests for missing, invalid, and valid credentials; origin
   rejection; safe loopback defaults; unsafe-bind refusal; token persistence;
   and redaction.
7. Add or update `SECURITY.md` with a concise threat model covering malicious
   browser pages/extensions, local processes, diagnostics, and profile data.

## Initial write scope

- `src/browser/base-driver.ts`
- `src/server.ts`
- `src/config.ts`
- `src/auth/**`
- focused tests beside those modules
- `SECURITY.md`
- `README.md`
- `docs/login-solution.md`

If implementation requires another path, explain why in the pull request.
Do not redesign transports, implement the MV3 extension, or start P0-04.

## Acceptance checks

```bash
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run smoke:startup
```

Acceptance requires exact results, no weakened assertions, no leaked secrets,
and an independent security review of the exact pull-request head SHA. Live
provider login, 2FA, and CAPTCHA bypass are not acceptance criteria.

## Required handoff

Report the remote branch, full commit SHA, draft PR URL, changed files, exact
check results, security assumptions, and remaining blockers. Do not merge.
