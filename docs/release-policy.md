# Authenticated release policy

This policy defines the P0-05 delivery contract. It does not announce a
published or production-ready release.

## Supported contract

- Release identifiers are exact stable tags: `vX.Y.Z`.
- Supported payloads are `linux-x64` and `windows-x64`.
- Supported Node.js majors are declared in the authenticated manifest; schema
  version 1 currently permits 22 through 24.
- GitHub CLI, Node.js, and the operating-system archive tools are trusted
  prerequisites.
- macOS, Linux/Windows Arm, prereleases, branch names, `latest`, and versions
  absent from GitHub Releases are unsupported and fail closed.

Each release contains standalone Linux and Windows bootstrap scripts, an
authenticated verifier, a schema-1 manifest, platform archives, `SHA256SUMS`,
an SPDX JSON SBOM, and GitHub build provenance/artifact attestations.

## Install and verify

Set `VERSION`/`$Version` to a release that actually exists. Do not substitute
`main` or `latest`.

Linux:

```bash
VERSION=v1.2.3
mkdir -p relay-bootstrap
gh release download "$VERSION" --repo Nan0pk/local-ai-relay \
  --pattern bootstrap.sh --dir relay-bootstrap
gh attestation verify relay-bootstrap/bootstrap.sh \
  --repo Nan0pk/local-ai-relay \
  --signer-workflow Nan0pk/local-ai-relay/.github/workflows/release.yml \
  --deny-self-hosted-runners
bash relay-bootstrap/bootstrap.sh --version "$VERSION"
```

Windows PowerShell:

```powershell
$Version = 'v1.2.3'
New-Item -ItemType Directory -Force relay-bootstrap | Out-Null
gh release download $Version --repo Nan0pk/local-ai-relay `
  --pattern bootstrap.ps1 --dir relay-bootstrap
gh attestation verify relay-bootstrap/bootstrap.ps1 `
  --repo Nan0pk/local-ai-relay `
  --signer-workflow Nan0pk/local-ai-relay/.github/workflows/release.yml `
  --deny-self-hosted-runners
& .\relay-bootstrap\bootstrap.ps1 -Version $Version
```

Bootstrap downloads only that version's manifest, verifier, and platform
archive. It verifies GitHub attestation evidence for each, then the verifier
checks the manifest contract and archive SHA-256 before setup runs. Any missing,
malformed, unsupported, mismatched, or unauthenticated input stops the install.
Verification pins both the repository and `.github/workflows/release.yml`
signer identity and rejects evidence produced on self-hosted runners.

## Update and rollback

Update by repeating the authenticated bootstrap download and execution with a
new exact version. A successful update records the old active version as the
rollback target and switches the active pointer only after setup succeeds.

Linux rollback:

```bash
bash relay-bootstrap/bootstrap.sh --rollback
```

Windows rollback:

```powershell
& .\relay-bootstrap\bootstrap.ps1 -Rollback
```

Rollback never downloads or executes new content. It selects only the prior
already-verified local version. Configuration and diagnostics are not deleted.

## Recovery

An interrupted or failed install leaves the active version unchanged. Remove
only the reported staging directory if automatic cleanup could not, then rerun
the same exact-version command. If the newly activated version later proves
unusable, run rollback. Never repair an install by pulling `main` into a
versioned directory.

## Trust and owner decisions

The chain trusts the local `gh` and Node.js binaries, GitHub's release and
attestation services, the repository identity `Nan0pk/local-ai-relay`, and the
GitHub Actions workflow identity recorded in provenance. A compromised local
prerequisite or authorized release workflow can compromise delivery.

The maintainer still owns release publication, tag/version choice, supported
platform expansion, retention policy, and any stable-readiness statement.
