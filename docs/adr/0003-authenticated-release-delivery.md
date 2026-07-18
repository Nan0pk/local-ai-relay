# ADR 0003: Authenticated release delivery

## Status

Accepted for P0-05. This contract does not declare a release ready.

## Contract

Installers accept one mandatory stable tag in the form `vX.Y.Z`. They never
resolve `latest`, a branch, or a mutable ref. A release publishes:

- `bootstrap.sh` and `bootstrap.ps1`
- `release-manifest.json`
- `verify-release.mjs`
- `local-ai-relay-vX.Y.Z-linux-x64.tar.gz`
- `local-ai-relay-vX.Y.Z-windows-x64.zip`
- `SHA256SUMS`, an SPDX JSON SBOM, and GitHub provenance/attestations

The manifest schema is version 1. It binds the repository, exact release tag,
supported Node.js major range, platform-specific artifact names, and lowercase
SHA-256 digests. Supported platforms are Linux x64 and Windows x64. macOS,
Arm, prereleases, and Node versions outside the manifest range fail closed.

The operator downloads a bootstrap script from the exact release and
authenticates it before execution. Bootstrap then authenticates the manifest,
verifier, and selected artifact with
`gh attestation verify --repo Nan0pk/local-ai-relay`. The
authenticated verifier then checks the manifest schema, exact requested
version, platform, runtime support, artifact name, and digest. Missing or
invalid evidence, malformed metadata, a mismatch, or an unavailable exact
release aborts installation; there is no fallback.

## Installation and rollback

Installation is user-level and transactional. A verified archive is unpacked
to a staging directory, checked, and moved to a versioned release directory.
Only then is the `current` pointer changed. The prior pointer is retained for
rollback. Configuration and diagnostics live outside version directories and
are neither replaced nor removed by install, failed update, or rollback.

The release workflow creates assets from a tag that exactly matches
`package.json`, generates checksums and an SPDX SBOM, and publishes build
provenance plus GitHub artifact attestations. All third-party actions are pinned
to immutable commit SHAs.
