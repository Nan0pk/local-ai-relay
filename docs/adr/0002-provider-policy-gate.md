# ADR 0002: Provider Policy Review Gate

## Status
Accepted

## Context
Upstream LLM webchat providers (such as OpenAI, Anthropic, Google, and others) maintain Terms of Service (ToS) and acceptable use policies that govern or prohibit automated interaction, scraping, or programmatic access to their consumer web interfaces. Using consumer browser automation (like Patchright/Playwright) to interface with these services carries operational and policy risks, including potential account termination or IP blocks.

## Decision
We establish a **Provider Policy Review Gate** as a mandatory administrative step before moving any provider from `experimental` (browser-based) to `stable` status, or releasing it to users. 

This gate requires developers to:
1. Document the upstream provider's public terms regarding automated browser interactions and API wrapping.
2. Formally declare that the browser transport is an experimental compatibility layer and does not guarantee policy compliance or bypass provider controls.
3. Require the operator to explicitly acknowledge policy risks during setup.

*Disclaimer: This review gate is an administrative process and does not constitute, represent, or substitute for formal legal advice.*

## Consequences
- Every registered browser provider must link to its policy status in its implementation docs.
- The relay remains safe-by-default by keeping browser transports labeled as `experimental` and requiring manual user interaction for authentication, preventing automated bot propagation.
