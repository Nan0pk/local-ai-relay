# Current task: P0-05 — Secure bootstrap and dependency delivery

**Status:** Open  
**Deliverable:** One draft pull request against `main`; do not merge.

## Goal

Make installation and updates fail closed: users must install an explicit
versioned release whose artifacts can be authenticated before execution, with a
clear rollback path. Mutable `main` remains a development checkout, never a
trusted distribution channel.

## Baseline first

Before editing, run and record:

```bash
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run smoke:startup
```

Inspect the current bootstrap/setup entry points and release workflows. Record
any baseline failure exactly; do not weaken tests or silently broaden scope.

## Required work

1. Define and implement one cross-platform release contract covering explicit
   versions, artifact names, SHA-256 verification, signature or GitHub artifact
   attestation verification, provenance, SBOM publication, supported-version
   checks, update behavior, and rollback.
2. Make Linux and Windows bootstrap paths download only an explicit release
   version, authenticate metadata and artifacts before executing them, and fail
   closed on missing, malformed, mismatched, tampered, or unsupported input.
3. Keep installation user-level where the operating system permits. Preserve
   existing configuration and diagnostics during failed installs and rollback.
4. Add deterministic tests for valid installation plus tampered artifact,
   checksum mismatch, invalid/missing authentication evidence, unsupported
   version, interrupted update, and rollback behavior. Tests must not require
   credentials or network access.
5. Add release automation that builds the versioned artifacts and publishes the
   checksum manifest, authentication evidence, provenance, and SBOM. Pin third-
   party workflow actions to immutable commit SHAs.
6. Document the exact supported install, verify, update, rollback, and recovery
   flows. Do not advertise release readiness until the acceptance evidence
   exists.

## Parallel-safe work split

When `$parallel-task` is available, use at most three workers plus one
coordinator. The coordinator first freezes the release manifest and verifier
CLI contract, then assigns these non-overlapping lanes:

- **Linux lane:** `bootstrap.sh`, `setup-linux.sh`, and new Linux-only tests.
- **Windows lane:** `bootstrap.ps1`, `setup-windows.ps1`,
  `setup-windows.cmd`, and new Windows-only tests.
- **Release lane:** new release workflow files, artifact/SBOM generation, and
  workflow-specific tests or validation.
- **Coordinator/integrator only:** shared verifier code, `package.json`, lock
  files, `README.md`, `SECURITY.md`, release-policy/ADR documents, `TASK.md`,
  and this task's final branch and pull request.

Workers must not edit coordinator-owned files. If the frozen contract changes,
stop the affected lane and rebase/reassign it; do not let workers invent
incompatible formats independently.

## Initial write scope

- `bootstrap.sh`
- `bootstrap.ps1`
- `setup-linux.sh`
- `setup-windows.ps1`
- `setup-windows.cmd`
- `.github/workflows/ci.yml`
- new release workflow files under `.github/workflows/`
- new delivery/verifier implementation and tests under `src/`, `scripts/`, or
  `tests/` as justified by the existing layout
- `package.json` and `package-lock.json`
- `README.md`, `SECURITY.md`, and new release-policy/ADR documentation

Expand beyond this list only when repository evidence requires it, and explain
why in the pull request.

## Acceptance checks

```bash
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run smoke:startup
```

Also run every new delivery-security test on its supported operating systems.
GitHub Actions must pass on Ubuntu and Windows. Tests must prove failure—not
fallback—for tampered or unauthenticated artifacts.

## Required handoff

Report the remote branch, full commit SHA, draft PR URL, changed files, exact
local and CI results, the release contract, security assumptions, unsupported
platforms/versions, and remaining owner decisions. Do not merge.
