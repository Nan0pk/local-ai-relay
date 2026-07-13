import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Locator, Page } from 'patchright';
import type { BrowserChatDriver, BrowserChatRequest, BrowserChatResult } from './types.js';
import { BrowserFailure } from './types.js';
import { SerialQueue } from './serial-queue.js';
import { launchPersistentRelayContext } from './runtime.js';

const CLAUDE_URL = 'https://claude.ai/';

/** macOS uses Meta instead of Control for select-all in contenteditable. */
const SELECT_ALL_KEY = process.platform === 'darwin' ? 'Meta' : 'Control';

export interface ClaudeDriverOptions {
  profileDir?: string;
  diagnosticsDir?: string;
  headless?: boolean;
  timeoutMs?: number;
  stableMs?: number;
  maxSessions?: number;
}

function defaultProfileDir(): string {
  return process.env.RELAY_BROWSER_PROFILE_CLAUDE
    ?? join(homedir(), '.local-ai-relay', 'browser-profiles', 'claude');
}

function defaultDiagnosticsDir(): string {
  return process.env.RELAY_DIAGNOSTICS_DIR
    ?? join(homedir(), '.local-ai-relay', 'diagnostics');
}

/**
 * Claude.ai webchat driver.
 *
 * All site-specific selectors, login detection, and completion heuristics
 * live here. The adapter (`src/providers/claude-browser.ts`) treats this
 * as an opaque `BrowserChatDriver` and never inspects Claude DOM directly.
 *
 * Selectors are intentionally layered: a primary, specific selector first,
 * then broader fallbacks. If Claude.ai ships a layout change, the driver
 * fails with `layout_changed` rather than silently clicking the wrong
 * element.
 */
export class ClaudePlaywrightDriver implements BrowserChatDriver {
  private readonly options: Required<ClaudeDriverOptions>;
  private readonly queue = new SerialQueue();
  private context?: BrowserContext;
  private readonly pages = new Map<string, Page>();

  constructor(options: ClaudeDriverOptions = {}) {
    this.options = {
      profileDir: options.profileDir ?? defaultProfileDir(),
      diagnosticsDir: options.diagnosticsDir ?? defaultDiagnosticsDir(),
      headless: options.headless ?? process.env.RELAY_BROWSER_HEADLESS === '1',
      timeoutMs: options.timeoutMs ?? Number(process.env.RELAY_BROWSER_TIMEOUT_MS ?? 180_000),
      stableMs: options.stableMs ?? 2_000,
      maxSessions: options.maxSessions ?? Number(process.env.RELAY_BROWSER_MAX_SESSIONS ?? 8),
    };
  }

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

  /** Open the persistent profile without submitting a prompt. */
  async openForLogin(): Promise<void> {
    const context = await this.getContext();
    const existing = context.pages().find((page) => page.url().startsWith(CLAUDE_URL));
    const page = existing ?? await context.newPage();
    await page.goto(CLAUDE_URL, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
  }

  /** Wait until the normal Claude composer is usable after login. */
  async waitUntilReady(timeoutMs = 10 * 60_000): Promise<void> {
    const context = await this.getContext();
    const page = context.pages().find((candidate) => candidate.url().startsWith(CLAUDE_URL));
    if (!page) throw new BrowserFailure('login_required', 'The Claude login page is not open.');
    await this.composer(page).waitFor({ state: 'visible', timeout: timeoutMs });
  }

  async close(): Promise<void> {
    this.pages.clear();
    await this.context?.close();
    this.context = undefined;
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    await mkdir(this.options.profileDir, { recursive: true });
    this.context = await launchPersistentRelayContext(this.options.profileDir, {
      headless: this.options.headless,
      viewport: { width: 1440, height: 960 },
    });
    this.context.on('close', () => {
      this.context = undefined;
      this.pages.clear();
    });
    return this.context;
  }

  private async pageFor(sessionId: string | undefined, reset: boolean): Promise<Page> {
    const key = sessionId ?? `stateless-${crypto.randomUUID()}`;
    const existing = this.pages.get(key);
    if (existing && !reset && !existing.isClosed()) return existing;
    if (existing && !existing.isClosed()) await existing.close();

    const context = await this.getContext();
    if (sessionId && this.pages.size >= this.options.maxSessions) {
      const oldest = this.pages.entries().next().value as [string, Page] | undefined;
      if (oldest) {
        this.pages.delete(oldest[0]);
        if (!oldest[1].isClosed()) await oldest[1].close();
      }
    }
    const page = await context.newPage();
    await page.goto(CLAUDE_URL, { waitUntil: 'domcontentloaded' });
    if (sessionId) this.pages.set(key, page);
    return page;
  }

  /** Claude.ai composer. ProseMirror contenteditable is the canonical target. */
  private composer(page: Page): Locator {
    return page.locator(
      'div[contenteditable="true"].ProseMirror, '
      + 'div[contenteditable="true"][data-testid="composer"], '
      + 'div[contenteditable="true"]',
    ).first();
  }

  /** Send button: paper-plane icon with aria-label "Send Message". */
  private sendButton(page: Page): Locator {
    return page.locator(
      'button[aria-label="Send Message"], '
      + 'button[data-testid="send-button"], '
      + 'button[type="submit"][aria-label*="Send" i]',
    ).first();
  }

  /** Stop button appears while Claude is generating. */
  private stopButton(page: Page): Locator {
    return page.locator(
      'button[aria-label="Stop"], '
      + 'button[data-testid="stop-button"], '
      + 'button[aria-label*="Stop" i]',
    ).first();
  }

  /** Assistant turns in the conversation thread. */
  private assistantMessages(page: Page): Locator {
    return page.locator(
      '[data-testid="assistant-message"], '
      + 'div.font-claude-message, '
      + 'div[class*="message"][data-testid*="assistant" i]',
    );
  }

  private async sendOnPage(page: Page, request: BrowserChatRequest): Promise<BrowserChatResult> {
    await this.assertNotBlocked(page);

    const composer = this.composer(page);
    try {
      await composer.waitFor({ state: 'visible', timeout: 30_000 });
    } catch {
      throw new BrowserFailure(
        'layout_changed',
        'Claude composer was not found. The page layout may have changed, or the session is on a non-chat surface. ' +
        'Run `npm run login:claude`, sign in normally, then retry.',
      );
    }
    if (await composer.getAttribute('aria-disabled') === 'true'
        || await composer.evaluate((el) => (el as { isContentEditable?: boolean }).isContentEditable === false).catch(() => false)) {
      throw new BrowserFailure('composer_disabled', 'Claude composer is disabled. The account may be rate-limited or out of quota.');
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
        const disabled = await sendButton.getAttribute('aria-disabled')
          .then((v) => v === 'true')
          .catch(() => false);
        if (!disabled && await sendButton.isEnabled().catch(() => false)) {
          await sendButton.click();
          clicked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (error) {
      if (error instanceof BrowserFailure) throw error;
      // Ignore wait errors and fall through to Enter.
    }
    if (!clicked) {
      await composer.press('Enter');
    }

    await this.waitForNewAssistantMessage(assistantMessages, countBefore, request.signal);
    const last = assistantMessages.last();
    const text = await this.waitUntilStable(page, last, request.signal);
    if (!text.trim()) {
      throw new BrowserFailure('empty_response', 'Claude returned an empty response.');
    }
    return { text, conversationUrl: page.url() };
  }

  /** Detect login, CAPTCHA, rate-limit, and quota surfaces before sending. */
  private async assertNotBlocked(page: Page): Promise<void> {
    const url = page.url();
    if (/\/login|\/auth\/|\/sign_?in/i.test(url)) {
      throw new BrowserFailure('login_required', 'Claude is showing a login page. Run `npm run login:claude` and sign in normally.');
    }
    if (await page.locator('iframe[title*="captcha" i], [data-testid*="captcha" i], .cf-turnstile').first().isVisible().catch(() => false)) {
      throw new BrowserFailure('captcha', 'Claude is showing a CAPTCHA or challenge. Solve it normally in the browser, then retry.');
    }
    // Claude.ai keeps an unauthenticated visitor on the root URL with a
    // "Sign in" / "Log in" button visible. Detect that surface explicitly
    // rather than waiting 30s for a composer that will never appear.
    const signInVisible = await page.locator(
      'a:has-text("Sign in"), button:has-text("Sign in"), '
      + 'a:has-text("Log in"), button:has-text("Log in"), '
      + 'a:has-text("Get started"), button:has-text("Get started")',
    ).first().isVisible().catch(() => false);
    if (signInVisible) {
      throw new BrowserFailure(
        'login_required',
        'Claude is showing its landing page with a sign-in button. Run `npm run login:claude` and sign in normally.',
      );
    }
    const body = await page.locator('body').innerText().catch(() => '');
    if (/you.?ve reached your (usage )?limit|rate limit/i.test(body)
        && !/upgrade/i.test(body.slice(0, 200))) {
      throw new BrowserFailure('rate_limit', 'Claude reports a rate limit. Wait for it to reset, then retry.');
    }
    if (/you.?ve reached your (daily|weekly|monthly) (message )?limit|out of quota|usage cap reached/i.test(body)) {
      throw new BrowserFailure('quota_exhausted', 'Claude reports quota exhaustion. Wait for the quota window to reset, then retry.');
    }
  }

  private async waitForNewAssistantMessage(
    messages: Locator,
    countBefore: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < this.options.timeoutMs) {
      if (signal?.aborted) throw new BrowserFailure('cancelled', 'Browser request was cancelled.');
      if (await messages.count() > countBefore) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new BrowserFailure('timeout', 'Timed out waiting for Claude to begin its response.');
  }

  private async waitUntilStable(page: Page, locator: Locator, signal: AbortSignal | undefined): Promise<string> {
    const started = Date.now();
    let lastText = '';
    let stableSince = Date.now();
    let sawStopButton = false;

    while (Date.now() - started < this.options.timeoutMs) {
      if (signal?.aborted) throw new BrowserFailure('cancelled', 'Browser request was cancelled.');
      const text = await locator.innerText().catch(() => '');
      if (text !== lastText) {
        lastText = text;
        stableSince = Date.now();
      }
      const stopVisible = await this.stopButton(page).isVisible().catch(() => false);
      if (stopVisible) sawStopButton = true;
      if (lastText && !stopVisible && Date.now() - stableSince >= this.options.stableMs) {
        // If generation started (stop button appeared) but the final text is
        // suspiciously short, surface an interruption rather than returning
        // what may be a truncated answer.
        if (sawStopButton && countWords(lastText) < 3) {
          throw new BrowserFailure(
            'generation_interrupted',
            'Claude appears to have stopped generating before producing a complete response. Retry the turn.',
          );
        }
        return lastText;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new BrowserFailure('timeout', 'Timed out waiting for Claude to finish its response.');
  }

  private async captureFailure(page: Page): Promise<void> {
    if (process.env.RELAY_DIAGNOSTICS === '0') return;
    try {
      await mkdir(this.options.diagnosticsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await page.screenshot({
        path: join(this.options.diagnosticsDir, `claude-${stamp}.png`),
        fullPage: false,
      });
    } catch {
      // Diagnostics must never hide the original browser failure.
    }
  }
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
