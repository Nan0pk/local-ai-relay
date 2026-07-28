# Release status — Local AI Relay

No stable tagged release is currently published or advertised by the
repository. Package, health, OpenAPI, extension, and release-validation
metadata use version `0.1.0`.

The source checkout contains work originally labeled in commit messages as
phases `v0.2.0` through `v0.9.0`. Those labels are development milestones, not
proof that matching artifacts were released, that every feature is integrated,
or that browser providers are live-ready.

## Candidate `v0.1.0`

The candidate contains:

- authenticated loopback Chat Completions and Responses APIs;
- deterministic mock models and readiness-gated browser adapters;
- Patchright login/probe commands and isolated profiles;
- Hermes and OpenCode configuration merge commands;
- bounded MCP list/status/delegate tools;
- an embedded operator dashboard and generated OpenAPI 3.1 document;
- authenticated, version-pinned bootstrap and release asset validation.

Before publishing a tag, both CI operating-system jobs must pass at the tagged
commit and the maintainer must record current authenticated evidence for every
browser provider claimed as ready.
