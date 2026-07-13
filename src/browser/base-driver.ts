import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Locator, Page } from 'patchright';
import type { BrowserChatDriver, BrowserChatRequest, BrowserChatResult } from './types.js';
import { BrowserFailure } from './types.js';
import { SerialQueue } from './serial-queue.js';
import { launchPersistentRelayContext } from './runtime.js';

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
    ?? join(homedir(), '.local-ai-relay', 'browser-profiles', cfg.name);
}

function defaultDiagnosticsDir(): string {
  return process.env.RELAY_DIAGNOSTICS_DIR
    ?? join(homedir(), '.local-ai-relay', 'diagnostics');
}

function layered(selectors: readonly string[]): string {
  return selectors.join(', ');
}

export abstract class BaseBrowserDriver implements BrowserChatDriver {
  protected readonly options: Required<BaseDriverOptions>;
  private readonly queue = new SerialQueue();
  private context?: BrowserContext;
  private readonly pages = new Map<string, Page>();

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
  }

  async waitUntilReady(timeoutMs = 10 * 60_000): Promise<void> {
    const cfg = this.config();
    const context = await this.getContext();
    const page = context.pages().find((p) => p.url().startsWith(cfg.url));
    if (!page) throw new BrowserFailure('login_required', `The ${cfg.name} login page is not open.`);
    await this.composer(page).waitFor({ state: 'visible', timeout: timeoutMs });
  }

  async close(): Promise<void> {
    this.pages.clear();
    await this.context?.close();
    this.context = undefined;
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    const cfg = this.config();
    await mkdir(this.options.profileDir, { recursive: true });
    try {
      this.context = await launchPersistentRelayContext(this.options.profileDir, {
        headless: this.options.headless,
        viewport: { width: 1440, height: 960 },
      });
    } catch (error) {
      // Browser launch failures are common in headless/CI environments
      // without a display or an installed browser. Map them to a typed
      // BrowserFailure so the HTTP layer returns a structured error instead
      // of a generic 500.
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
    this.context.on('close', () => { this.context = undefined; this.pages.clear(); });
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

  protected composer(page: Page): Locator {
    return page.locator(layered(this.config().composerSelectors)).first();
  }

  protected sendButton(page: Page): Locator {
    return page.locator(layered(this.config().sendButtonSelectors)).first();
  }

  protected stopButton(page: Page): Locator {
    return page.locator(layered(this.config().stopButtonSelectors)).first();
  }

  protected assistantMessages(page: Page): Locator {
    return page.locator(layered(this.config().assistantMessageSelectors));
  }

  private async sendOnPage(page: Page, request: BrowserChatRequest): Promise<BrowserChatResult> {
    const cfg = this.config();
    await this.assertNotBlocked(page);
    const composer = this.composer(page);
    try {
      await composer.waitFor({ state: 'visible', timeout: 30_000 });
    } catch {
      throw new BrowserFailure('layout_changed',
        `${cfg.name} composer was not found. The page layout may have changed, or the session is on a non-chat surface. ` +
        `Run \`npm run login:${cfg.name}\`, sign in normally, then retry.`);
    }
    if (await composer.getAttribute('aria-disabled') === 'true'
        || await composer.evaluate((el) => (el as { isContentEditable?: boolean }).isContentEditable === false).catch(() => false)) {
      throw new BrowserFailure('composer_disabled', `${cfg.name} composer is disabled. The account may be rate-limited or out of quota.`);
    }

    const assistantMessages = this.assistantMessages(page);
    const countBefore = await assistantMessages.count();
    await composer.focus();
    await page.keyboard.press(`${SELECT_ALL_KEY}+A`);
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(request.prompt);

    const sendButton = this.sendButton(page);
    let clicked = false;
    try {
      await sendButton.waitFor({ state: 'visible', timeout: 5_000 });
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

    await this.waitForNewAssistantMessage(assistantMessages, countBefore, request.signal);
    const last = assistantMessages.last();
    const text = await this.waitUntilStable(page, last, request.signal);
    if (!text.trim()) throw new BrowserFailure('empty_response', `${cfg.name} returned an empty response.`);
    return { text, conversationUrl: page.url() };
  }

  private async assertNotBlocked(page: Page): Promise<void> {
    const cfg = this.config();
    const url = page.url();
    if (cfg.loginUrlPattern.test(url)) {
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

  private async waitForNewAssistantMessage(messages: Locator, countBefore: number, signal: AbortSignal | undefined): Promise<void> {
    const cfg = this.config();
    const started = Date.now();
    while (Date.now() - started < this.options.timeoutMs) {
      if (signal?.aborted) throw new BrowserFailure('cancelled', 'Browser request was cancelled.');
      if (await messages.count() > countBefore) return;
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
      const stopVisible = await this.stopButton(page).isVisible().catch(() => false);
      if (stopVisible) sawStop = true;
      if (lastText && !stopVisible && Date.now() - stableSince >= this.options.stableMs) {
        if (sawStop && countWords(lastText) < 3) {
          throw new BrowserFailure('generation_interrupted',
            `${cfg.name} appears to have stopped generating before producing a complete response. Retry the turn.`);
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
    } catch { /* diagnostics must never hide the original failure */ }
  }
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
