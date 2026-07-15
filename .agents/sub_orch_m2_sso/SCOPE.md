# Scope: Shared Browser Profile & Google SSO Click Automation

## Architecture
- `BrowserContextManager` (`src/browser/context-manager.ts`): Singleton managing a single persistent Chromium context using the shared user data directory `~/.local-ai-relay/browser-profiles/shared`.
- `BaseBrowserDriver` (`src/browser/base-driver.ts`): Refactored to retrieve its `BrowserContext` from the singleton `BrowserContextManager` instead of launching its own.
- Google SSO Automation: A hook in `BaseBrowserDriver` to click Google SSO buttons when encountering login pages or `accounts.google.com`.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| 1 | Design & Contract Definition | Set up SCOPE.md and plan interfaces | None | DONE |
| 2 | BrowserContextManager | Implement singleton context manager with shared profile dir | 1 | PLANNED |
| 3 | BaseBrowserDriver Integration | Retrieve context from BrowserContextManager instead of launching own | 2 | PLANNED |
| 4 | Google SSO Hook | Detect and automate Google SSO button and account selection | 3 | PLANNED |
| 5 | Verification & QA | Run build, tests, and ensure unit tests pass | 4 | PLANNED |

## Interface Contracts
### BrowserContextManager
- Class: `BrowserContextManager`
- Static method: `getInstance(options?: ContextManagerOptions): BrowserContextManager`
- Async method: `getContext(): Promise<BrowserContext>`
- Async method: `close(): Promise<void>`

### BaseBrowserDriver modifications
- Replace direct `launchPersistentRelayContext` with calling `BrowserContextManager.getInstance(...).getContext()`.
- Add Google SSO automation checks on page load / navigation.
