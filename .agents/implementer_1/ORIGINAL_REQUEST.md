## 2026-07-15T19:08:53Z
You are the Worker agent. Your mission is to implement and register the missing, login-free Arena.ai provider (LMSYS Chatbot Arena) in the local-ai-relay project.

Please perform the following tasks:
1. Read the global project context in `PROJECT.md` and the milestone scope in `/home/victus/agy/.agents/sub_orch_m1_arena/SCOPE.md`.
2. Implement `src/browser/arena-driver.ts` which extends `BaseBrowserDriver` with selectors for the Gradio interface elements (chat input textbox, send button, output message containers, etc.) and auto-handles Terms and "Direct Chat" tab selection.
3. Implement `src/providers/arena-browser.ts` mapping request prompt to the driver, using `browser-arena-free` as model ID.
4. Register the new provider:
   - Add it to `src/providers/registry.ts` with model ID `browser-arena-free`.
   - Add it to `src/browser/driver-registry.ts` as `arena`.
5. Write a unit test `src/providers/arena-browser.test.ts` reusing `runBrowserProviderTestMatrix`.
6. Verify that the build completes (`npm run build`) and all tests pass (`npm test`).
7. Write a detailed handoff report when done and send it back to the sub-orchestrator.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-07-15T19:13:17Z
You are the Worker agent. Fix two minor TypeScript compilation errors in files outside of the Arena provider scope, but which block the project build:

1. In `/home/victus/agy/src/browser/base-driver.ts` around line 183:
   The `page` parameter in `handleSsoLogin(page: Page)` is unused. Add `void page;` inside the method body or prefix the parameter with `_` to satisfy strict compiler checks.
2. In `/home/victus/agy/src/browser/context-manager.ts` around line 12:
   The private property `options` in the constructor is unused. Add `void this.options;` inside the constructor body to satisfy strict compiler checks.

After applying these fixes:
1. Verify the project builds successfully by running `npm run build`.
2. Verify all tests pass by running `npm test`.
3. Provide a detailed report of the build and test results.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-07-15T19:16:08Z
Objective: Run the initial build (`npm run build`) and test suite (`npm test`) on the workspace `/home/victus/agy` to see if everything compiles and passes initially.
Return the output of the build and test.
Apply /caveman (ultra-concise output) and /ponytail (simplest approach).

## 2026-07-15T19:17:34Z
Objective:
1. Implement BrowserContextManager in src/browser/context-manager.ts.
2. Update BaseBrowserDriver in src/browser/base-driver.ts to use BrowserContextManager singleton and implement handleSsoLogin.
3. Run npm run build and npm test to verify.

Apply /caveman and /ponytail.

Details:
In `src/browser/context-manager.ts`:
```typescript
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext } from 'patchright';
import { launchPersistentRelayContext } from './runtime.js';

export interface ContextManagerOptions {
  profileDir?: string;
  headless?: boolean;
}

export class BrowserContextManager {
  private static instance: BrowserContextManager | null = null;
  private context: BrowserContext | null = null;

  private constructor(private options?: ContextManagerOptions) {}

  public static getInstance(options?: ContextManagerOptions): BrowserContextManager {
    if (!BrowserContextManager.instance) {
      BrowserContextManager.instance = new BrowserContextManager(options);
    }
    return BrowserContextManager.instance;
  }

  public async getContext(): Promise<BrowserContext> {
    if (!this.context) {
      const pDir = this.options?.profileDir ?? join(homedir(), '.local-ai-relay', 'browser-profiles', 'shared');
      const headless = this.options?.headless ?? process.env.RELAY_BROWSER_HEADLESS === '1';
      await mkdir(pDir, { recursive: true });
      this.context = await launchPersistentRelayContext(pDir, {
        headless,
        viewport: { width: 1440, height: 960 },
      });
      this.context.on('close', () => {
        this.context = null;
      });
    }
    return this.context;
  }

  public async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    BrowserContextManager.instance = null;
  }
}
```

In `src/browser/base-driver.ts`:
1. Add import:
```typescript
import { BrowserContextManager } from './context-manager.js';
```
2. Refactor `getContext()`:
```typescript
  private async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    const cfg = this.config();
    try {
      this.context = await BrowserContextManager.getInstance({
        profileDir: this.options.profileDir,
        headless: this.options.headless,
      }).getContext();
      
      this.context.on('close', () => {
        this.context = undefined;
        this.pages.clear();
      });

      this.context.on('page', (p) => {
        p.on('framenavigated', async (frame) => {
          if (frame === p.mainFrame()) {
            await this.handleSsoLogin(p).catch(() => {});
          }
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/executable doesn.?t exist|playwright was just installed|browserType\.launch/i.test(message)) {
        throw new BrowserFailure('layout_changed',
          `${cfg.name} browser could not launch. Install Google Chrome or run \`npm run browser:install\`. ` +
          `Underlying error: ${message.split('\n')[0]}`);
      }
      if (/display|wayland|xauth|cannot open display/i.test(message)) {
        throw new BrowserFailure('layout_changed',
          `${cfg.name} browser could not launch because no graphical display was detected. ` +
          `Run on a machine with a visible desktop session, or set RELAY_BROWSER_HEADLESS=1.`);
      }
      throw new BrowserFailure('layout_changed',
        `${cfg.name} browser failed to launch: ${message.split('\n')[0]}`);
    }
    return this.context;
  }
```
3. Implement `handleSsoLogin(page)`:
```typescript
  async handleSsoLogin(page: Page): Promise<boolean> {
    try {
      if (!page || typeof page.url !== 'function') return false;
      const url = page.url() || '';
      const cfg = this.config();
      const isLoginPage = cfg.loginUrlPattern.test(url) || 
        cfg.signInButtonLabels.some(l => url.toLowerCase().includes(l.toLowerCase()));

      if (isLoginPage) {
        const ssoSelectors = [
          'button:has-text("Sign in with Google")',
          'button:has-text("Continue with Google")',
          'a:has-text("Sign in with Google")',
          'a:has-text("Continue with Google")',
          'div[role="button"]:has-text("Sign in with Google")',
          'div[role="button"]:has-text("Continue with Google")',
          'button:has-text("Google")',
          'a:has-text("Google")',
          '[data-provider="google"]',
        ];
        for (const selector of ssoSelectors) {
          const btn = page.locator(selector).first();
          if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
            await btn.click().catch(() => {});
            return true;
          }
        }
      }

      if (url.includes('accounts.google.com')) {
        const accountSelectors = [
          '[data-authuser="0"]',
          '.authclass',
          'div[role="link"]',
          'a[role="link"]',
          'li[role="link"]',
          'div[data-email]',
          'button:has-text("@gmail.com")',
          'div:has-text("@gmail.com")',
        ];
        for (const selector of accountSelectors) {
          const acc = page.locator(selector).first();
          if (await acc.isVisible().catch(() => false) && await acc.isEnabled().catch(() => false)) {
            await acc.click().catch(() => {});
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }
```
4. Update `openForLogin()`:
```typescript
  async openForLogin(): Promise<void> {
    const cfg = this.config();
    const context = await this.getContext();
    const existing = context.pages().find((p) => p.url().startsWith(cfg.url));
    const page = existing ?? await context.newPage();
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
    await this.handleSsoLogin(page).catch(() => {});
  }
```
5. Update `waitUntilReady()`:
```typescript
  async waitUntilReady(timeoutMs = 10 * 60_000): Promise<void> {
    const cfg = this.config();
    const context = await this.getContext();
    const page = context.pages().find((p) => p.url().startsWith(cfg.url));
    if (!page) throw new BrowserFailure('login_required', `The ${cfg.name} login page is not open.`);
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await this.handleSsoLogin(page).catch(() => {});
      const composer = await this.resolve(page, 'composer', cfg.composerSelectors, false);
      if (composer && await isComposerUsable(composer)) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new BrowserFailure('login_required', `The ${cfg.name} composer did not become ready before timeout.`);
  }
```
6. Update `assertNotBlocked()`:
```typescript
  private async assertNotBlocked(page: Page): Promise<void> {
    const cfg = this.config();
    const url = page.url();
    if (cfg.loginUrlPattern.test(url)) {
      const didSso = await this.handleSsoLogin(page).catch(() => false);
      if (didSso) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (!cfg.loginUrlPattern.test(page.url())) {
          return;
        }
      }
      throw new BrowserFailure('login_required',
        `${cfg.name} is showing a login page. Run \`npm run login:${cfg.name}\` and sign in normally.`);
    }
    if (await page.locator('iframe[title*="captcha" i], [data-testid*="captcha" i], .cf-turnstile, #captcha').first().isVisible().catch(() => false)) {
      throw new BrowserFailure('captcha', `${cfg.name} is showing a CAPTCHA or challenge. Solve it normally in the browser, then retry.`);
    }
    if (cfg.signInButtonLabels.length > 0) {
      const labelPattern = cfg.signInButtonLabels.map((l) => `a:has-text("${l}"), button:has-text("${l}")`).join(', ');
      const signInVisible = await page.locator(labelPattern).first().isVisible().catch(() => false);
      if (signInVisible) {
        const didSso = await this.handleSsoLogin(page).catch(() => false);
        if (didSso) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const stillVisible = await page.locator(labelPattern).first().isVisible().catch(() => false);
          if (!stillVisible) {
            return;
          }
        }
        throw new BrowserFailure('login_required',
          `${cfg.name} is showing its landing page with a sign-in button. Run \`npm run login:${cfg.name}\` and sign in normally.`);
      }
    }
    const body = await page.locator('body').innerText().catch(() => '');
    if (cfg.captchaTextPattern?.test(body)) {
      throw new BrowserFailure('captcha', `${cfg.name} is showing a CAPTCHA or challenge. Solve it normally in the browser, then retry.`);
    }
    if (cfg.rateLimitPattern && cfg.rateLimitPattern.test(body)) {
      throw new BrowserFailure('rate_limit', `${cfg.name} reports a rate limit. Wait for it to reset, then retry.`);
    }
    if (cfg.quotaPattern && cfg.quotaPattern.test(body)) {
      throw new BrowserFailure('quota_exhausted', `${cfg.name} reports quota exhaustion. Wait for the quota window to reset, then retry.`);
    }
  }
```

## 2026-07-15T19:37:31Z
You are the E2E Test Finalizer. The previous subagent has written the mock browser, stubs, and the full 60-case E2E test suite in `tests/e2e/e2e.test.ts`, and updated `package.json` with `"test:e2e"`.

MANDATORY DIRECTIVES:
- /caveman (ultra-concise) and /ponytail (simplest/laziest path): Keep everything as simple, minimal, and concise as possible.
- MANDATORY INTEGRITY WARNING:
  DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your remaining tasks are:
1. Create `TEST_INFRA.md` at the project root using the draft at `/home/victus/agy/.agents/sub_orch_e2e/test_infra_draft.md`.
2. Run the build command (`npm run build`), unit tests (`npm test`), and E2E tests (`npm run test:e2e`) to verify all of them compile and pass successfully.
3. Once all tests are confirmed passing, write `TEST_READY.md` at the project root using the template in the instructions.
4. Write your handoff report and notify me.

