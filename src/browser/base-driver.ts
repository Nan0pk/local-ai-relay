import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getWritableHome } from './paths.js';
import type { BrowserContext, Locator, Page } from 'patchright';
import type { BrowserChatDriver, BrowserChatRequest, BrowserChatResult } from './types.js';
import { BrowserFailure } from './types.js';
import { SerialQueue } from './serial-queue.js';
import { BrowserContextManager } from './context-manager.js';

const SELECT_ALL_KEY = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * Shared browser-driver skeleton.
 *
 * Each site-specific driver (ChatGPT, Claude, Gemini, ...) extends this
 * base and supplies only its URL, selectors, and login/rate-limit
 * detection logic. The base handles: persistent-profile lifecycle,
 * serial queue, session-page caching, native Patchright input, completion
 * stability detection, and redacted local diagnostics.
 *
 * Site-specific behavior lives in the subclass via the abstract methods
 * and the `SiteConfig` returned by `config()`. No provider conditionals
 * live here.
 */
export interface SiteConfig {
  /** CLI name, also used for the default profile directory name. */
  readonly name: string;
  /** Canonical webchat URL. */
  readonly url: string;
  /** Env var name to override the profile dir. */
  readonly profileEnvVar: string;
  /** Layered composer selectors (most-specific first). */
  readonly composerSelectors: readonly string[];
  /** Layered send-button selectors. */
  readonly sendButtonSelectors: readonly string[];
  /** Layered stop-button selectors. */
  readonly stopButtonSelectors: readonly string[];
  /** Layered assistant-message selectors. */
  readonly assistantMessageSelectors: readonly string[];
  /** URL regex that indicates a login/auth page. */
  readonly loginUrlPattern: RegExp;
  /** Text labels on the landing page that indicate sign-in is required. */
  readonly signInButtonLabels: readonly string[];
  /** Body-text regex that indicates a rate limit (excludes upgrade prompts). */
  readonly rateLimitPattern?: RegExp;
  /** Body-text regex that indicates quota exhaustion. */
  readonly quotaPattern?: RegExp;
  /** Extra body-text patterns to treat as captcha (iframe detection is built in). */
  readonly captchaTextPattern?: RegExp;
  /**
   * When true, the send-button click uses `{ force: true }` after DOM-level
   * enabled checks pass. Needed for headful/occluded contexts (e.g. systemd
   * services) where Playwright actionability checks throttle. The DOM checks
   * (aria-disabled, isEnabled) already guard against clicking a genuinely
   * disabled control, so force-clicking is safe.
   */
  readonly forceClick?: boolean;
}

export interface BaseDriverOptions {
  profileDir?: string;
  diagnosticsDir?: string;
  headless?: boolean;
  timeoutMs?: number;
  stableMs?: number;
  maxSessions?: number;
}

function defaultProfileDir(cfg: SiteConfig): string {
  return process.env[cfg.profileEnvVar]
    ?? join(getWritableHome(), '.local-ai-relay', 'browser-profiles', cfg.name);
}

function defaultDiagnosticsDir(): string {
  return process.env.RELAY_DIAGNOSTICS_DIR
    ?? join(getWritableHome(), '.local-ai-relay', 'diagnostics');
}

export interface ResolvedLocator {
  locator: Locator;
  selector: string;
}

/** Resolve selectors in configuration order, never DOM order. */
export async function resolveVisibleSelector(
  page: Page,
  selectors: readonly string[],
  requireEnabled = true,
): Promise<ResolvedLocator | undefined> {
  for (const selector of selectors) {
    const matches = page.locator(selector);
    const count = await matches.count().catch(() => 0);
    for (let index = 0; index < count; index++) {
      const locator = matches.nth(index);
      if (!await locator.isVisible().catch(() => false)) continue;
      if (requireEnabled && !await locator.isEnabled().catch(() => false)) continue;
      return { locator, selector };
    }
  }
  return undefined;
}

/** Correctly distinguish native inputs from contenteditable composers. */
export async function isComposerUsable(composer: Locator): Promise<boolean> {
  if (!await composer.isEnabled().catch(() => false)) return false;
  if (await composer.getAttribute('aria-disabled').catch(() => null) === 'true') return false;
  const state = await composer.evaluate((element) => ({
    tagName: element.tagName.toLowerCase(),
    readOnly: ['input', 'textarea'].includes(element.tagName.toLowerCase())
      ? (element as unknown as { readOnly?: boolean }).readOnly === true
      : false,
    contentEditable: element.getAttribute('contenteditable'),
  })).catch(() => undefined);
  if (!state || state.readOnly) return false;
  return state.contentEditable === null || state.contentEditable.toLowerCase() !== 'false';
}

export abstract class BaseBrowserDriver implements BrowserChatDriver {
  protected readonly options: Required<BaseDriverOptions>;
  private readonly queue = new SerialQueue();
  private context?: BrowserContext;
  private readonly pages = new Map<string, Page>();
  private readonly selectedSelectors = new WeakMap<Page, Map<string, string>>();

  constructor(options: BaseDriverOptions = {}) {
    const cfg = this.config();
    this.options = {
      profileDir: options.profileDir ?? defaultProfileDir(cfg),
      diagnosticsDir: options.diagnosticsDir ?? defaultDiagnosticsDir(),
      headless: options.headless ?? process.env.RELAY_BROWSER_HEADLESS === '1',
      timeoutMs: options.timeoutMs ?? Number(process.env.RELAY_BROWSER_TIMEOUT_MS ?? 180_000),
      stableMs: options.stableMs ?? 2_000,
      maxSessions: options.maxSessions ?? Number(process.env.RELAY_BROWSER_MAX_SESSIONS ?? 8),
    };
  }

  /** Subclass returns its site-specific URL, selectors, and detection regex. */
  protected abstract config(): SiteConfig;

  async send(request: BrowserChatRequest): Promise<BrowserChatResult> {
    return this.queue.run(async () => {
      const page = await this.pageFor(request.sessionId, request.resetSession);
      try {
        return await this.sendOnPage(page, request);
      } catch (error) {
        await this.captureFailure(page);
        throw error;
      } finally {
        if (!request.sessionId && !page.isClosed()) await page.close();
      }
    });
  }

  async openForLogin(): Promise<void> {
    const cfg = this.config();
    const context = await this.getContext();
    const existing = context.pages().find((p) => p.url().startsWith(cfg.url));
    const page = existing ?? await context.newPage();
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
    await this.handleSsoLogin(page).catch(() => {});
  }

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

  async close(): Promise<void> {
    this.pages.clear();
    await this.context?.close();
    this.context = undefined;
  }

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

      return false;
    } catch {
      return false;
    }
  }

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

  private async pageFor(sessionId: string | undefined, reset: boolean): Promise<Page> {
    const cfg = this.config();
    const key = sessionId ?? `stateless-${crypto.randomUUID()}`;
    const existing = this.pages.get(key);
    if (existing && !reset && !existing.isClosed()) return existing;
    if (existing && !existing.isClosed()) await existing.close();
    const context = await this.getContext();
    if (sessionId && this.pages.size >= this.options.maxSessions) {
      const oldest = this.pages.entries().next().value as [string, Page] | undefined;
      if (oldest) { this.pages.delete(oldest[0]); if (!oldest[1].isClosed()) await oldest[1].close(); }
    }
    const page = await context.newPage();
    await page.goto(cfg.url, { waitUntil: 'domcontentloaded' });
    if (sessionId) this.pages.set(key, page);
    return page;
  }

  private recordSelector(page: Page, kind: string, selector: string): void {
    const selected = this.selectedSelectors.get(page) ?? new Map<string, string>();
    selected.set(kind, selector);
    this.selectedSelectors.set(page, selected);
  }

  private async resolve(
    page: Page,
    kind: string,
    selectors: readonly string[],
    requireEnabled = true,
  ): Promise<Locator | undefined> {
    const resolved = await resolveVisibleSelector(page, selectors, requireEnabled);
    if (resolved) this.recordSelector(page, kind, resolved.selector);
    return resolved?.locator;
  }

  private async waitForResolved(
    page: Page,
    kind: string,
    selectors: readonly string[],
    timeoutMs: number,
    requireEnabled = true,
  ): Promise<Locator | undefined> {
    const started = Date.now();
    do {
      const locator = await this.resolve(page, kind, selectors, requireEnabled);
      if (locator) return locator;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() - started < timeoutMs);
    return undefined;
  }

  protected composer(page: Page): Promise<Locator | undefined> {
    return this.resolve(page, 'composer', this.config().composerSelectors, false);
  }

  protected sendButton(page: Page): Promise<Locator | undefined> {
    return this.resolve(page, 'sendButton', this.config().sendButtonSelectors);
  }

  protected stopButton(page: Page): Promise<Locator | undefined> {
    return this.resolve(page, 'stopButton', this.config().stopButtonSelectors);
  }

  private async assistantMessageCounts(page: Page): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const selector of this.config().assistantMessageSelectors) {
      counts.set(selector, await page.locator(selector).count().catch(() => 0));
    }
    return counts;
  }

  private async sendOnPage(page: Page, request: BrowserChatRequest): Promise<BrowserChatResult> {
    const cfg = this.config();
    await this.assertNotBlocked(page);
    const composer = await this.waitForResolved(page, 'composer', cfg.composerSelectors, 30_000, false);
    if (!composer) {
      throw new BrowserFailure('layout_changed',
        `${cfg.name} composer was not found. The page layout may have changed, or the session is on a non-chat surface. ` +
        `Run \`npm run login:${cfg.name}\`, sign in normally, then retry.`);
    }
    if (!await isComposerUsable(composer)) {
      throw new BrowserFailure('composer_disabled', `${cfg.name} composer is disabled. The account may be rate-limited or out of quota.`);
    }

    const assistantCountsBefore = await this.assistantMessageCounts(page);
    await composer.focus();
    await page.keyboard.press(`${SELECT_ALL_KEY}+A`);
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(request.prompt);

    const sendButton = await this.waitForResolved(page, 'sendButton', cfg.sendButtonSelectors, 5_000);
    let clicked = false;
    if (sendButton) try {
      for (let i = 0; i < 30; i++) {
        if (request.signal?.aborted) throw new BrowserFailure('cancelled', 'Browser request was cancelled.');
        const disabled = await sendButton.getAttribute('aria-disabled').then((v) => v === 'true').catch(() => false);
        if (!disabled && await sendButton.isEnabled().catch(() => false)) {
          await sendButton.click({ force: cfg.forceClick === true });
          clicked = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (error) {
      if (error instanceof BrowserFailure) throw error;
    }
    if (!clicked) await composer.press('Enter');

    const assistantMessages = await this.waitForNewAssistantMessage(page, assistantCountsBefore, request.signal);
    const last = assistantMessages.last();
    const text = await this.waitUntilStable(page, last, request.signal);
    if (!text.trim()) throw new BrowserFailure('empty_response', `${cfg.name} returned an empty response.`);
    return { text, conversationUrl: page.url() };
  }

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

  private async waitForNewAssistantMessage(
    page: Page,
    countsBefore: ReadonlyMap<string, number>,
    signal: AbortSignal | undefined,
  ): Promise<Locator> {
    const cfg = this.config();
    const started = Date.now();
    while (Date.now() - started < this.options.timeoutMs) {
      if (signal?.aborted) throw new BrowserFailure('cancelled', 'Browser request was cancelled.');
      for (const selector of cfg.assistantMessageSelectors) {
        const messages = page.locator(selector);
        if (await messages.count().catch(() => 0) > (countsBefore.get(selector) ?? 0)) {
          this.recordSelector(page, 'assistantMessages', selector);
          return messages;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new BrowserFailure('timeout', `Timed out waiting for ${cfg.name} to begin its response.`);
  }

  private async waitUntilStable(page: Page, locator: Locator, signal: AbortSignal | undefined): Promise<string> {
    const cfg = this.config();
    const started = Date.now();
    let lastText = '';
    let stableSince = Date.now();
    let sawStop = false;
    while (Date.now() - started < this.options.timeoutMs) {
      if (signal?.aborted) throw new BrowserFailure('cancelled', 'Browser request was cancelled.');
      const text = await locator.innerText().catch(() => '');
      if (text !== lastText) { lastText = text; stableSince = Date.now(); }
      const stopButton = await this.stopButton(page);
      const stopVisible = stopButton ? await stopButton.isVisible().catch(() => false) : false;
      if (stopVisible) sawStop = true;

      // Fail fast on empty response after stop button appeared and disappeared
      if (sawStop && !stopVisible && !lastText.trim() && Date.now() - stableSince >= this.options.stableMs) {
        throw new BrowserFailure('empty_response', `${cfg.name} returned an empty response.`);
      }

      if (lastText && !stopVisible && Date.now() - stableSince >= this.options.stableMs) {
        if (sawStop && countWords(lastText) < 3) {
          if (await hasPageInterruptionError(page)) {
            throw new BrowserFailure('generation_interrupted',
              `${cfg.name} appears to have stopped generating before producing a complete response. Retry the turn.`);
          }
        }
        return lastText;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    throw new BrowserFailure('timeout', `Timed out waiting for ${cfg.name} to finish its response.`);
  }

  private async captureFailure(page: Page): Promise<void> {
    if (process.env.RELAY_DIAGNOSTICS === '0') return;
    const cfg = this.config();
    try {
      await mkdir(this.options.diagnosticsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await page.screenshot({ path: join(this.options.diagnosticsDir, `${cfg.name}-${stamp}.png`), fullPage: false });
      const selectors = Object.fromEntries(this.selectedSelectors.get(page) ?? []);
      await writeFile(
        join(this.options.diagnosticsDir, `${cfg.name}-${stamp}.json`),
        JSON.stringify({ capturedAt: new Date().toISOString(), url: page.url(), selectors }, null, 2),
        { mode: 0o600 },
      );
    } catch { /* diagnostics must never hide the original failure */ }
  }
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

async function hasPageInterruptionError(page: Page): Promise<boolean> {
  const errorLocator = page.locator('div[role="alert"], .error-message, .text-red-500:not(pre *, code *), .text-orange-500:not(pre *, code *)');
  const count = await errorLocator.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const isVisible = await errorLocator.nth(i).isVisible().catch(() => false);
    if (isVisible) return true;
  }
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const interruptionKeywords = /error occurred|something went wrong|failed to generate|violates.*policies|network error|unable to load|please try again/i;
  return interruptionKeywords.test(bodyText);
}

