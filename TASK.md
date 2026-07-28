# Current task: click-to-work productization

**Status:** Implemented on `feat/click-to-work`; deterministic verification and
review remain before a draft pull request.

## Goal

Make the repository useful to a first-time operator who wants to work in
Hermes, OpenCode, or another OpenAI-compatible harness without developing this
project. README is screen zero; the local Control Center is screen one.

## Required behavior

- Production never exposes or silently routes to deterministic mock providers.
- The installer opens the dashboard rather than forcing provider login.
- Authenticated installs create an OS launcher; source use remains one command.
- Provider connection shows stages, login handoff, cancellation, readiness, and
  linked redacted errors.
- Real successful use refreshes evidence; known invalidating failures clear it.
- Automatic routing uses only selected ready providers and retries only known
  pre-submission failures.
- Harness status distinguishes installed executable, existing config, and
  relay-connected state.
- Harness catalogs contain only `relay-auto` plus currently ready real models.
- Hermes/OpenCode config is backed up, backup retention is bounded, and
  relay-owned changes are reversible.
- Installed harnesses can be launched from the dashboard in a visible terminal.
- Setup doctor, in-dashboard test, generic client handoff, disconnect-one/all,
  and no-change cleanup preview are available.
- README starts with outcome, install truth, three-step flow, browser/login
  boundary, status meanings, troubleshooting, switching, and removal.

## Acceptance

```bash
npm ci
npm run verify
git diff --check
```

Authenticated live provider and harness runs remain maintainer actions because
CI has no personal provider credentials or graphical login session. The final
report must distinguish deterministic proof from that owner-run evidence.
