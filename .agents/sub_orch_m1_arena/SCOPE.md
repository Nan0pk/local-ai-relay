# Scope: arena-milestone

## Architecture
- Browser-based provider that leverages Gradio interface elements on the LMSYS Chatbot Arena site (Direct Chat).
- Driver extends `BaseBrowserDriver` to input/output/wait using Puppeteer/Playwright-like selectors.
- Provider adapts prompt request to driver, handles responses, and registry handles resolution.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Explore | Explore LMSYS Chatbot Arena site, existing drivers, and registry | none | DONE |
| 2 | Implementation | Implement arena-driver.ts and arena-browser.ts | M1 | DONE |
| 3 | Registration | Register provider in registry.ts and driver-registry.ts | M2 | DONE |
| 4 | Verification | Write arena-browser.test.ts and verify build & tests | M3 | DONE |

## Interface Contracts
- `src/browser/arena-driver.ts` extends `BaseBrowserDriver` from `src/browser/base-driver.ts`
- `src/providers/arena-browser.ts` implements `Provider` from `src/providers/types.ts`
- Registry entries map model `browser-arena-free` to the Arena provider and `arena` driver.
