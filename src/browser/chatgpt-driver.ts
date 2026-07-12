import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Locator, Page } from 'playwright';
import type { BrowserChatDriver, BrowserChatRequest, BrowserChatResult } from './types.js';
import { SerialQueue } from './serial-queue.js';
import { browserBinariesDir, findSystemBrowser } from './paths.js';

const CHATGPT_URL = 'https://chatgpt.com/';

export interface ChatGptDriverOptions {
  profileDir?: string;
  diagnosticsDir?: string;
  headless?: boolean;
  timeoutMs?: number;
  stableMs?: number;
  maxSessions?: number;
}

function defaultProfileDir(): string {
  return process.env.RELAY_BROWSER_PROFILE
    ?? join(homedir(), '.local-ai-relay', 'browser-profiles', 'chatgpt');
}

function defaultDiagnosticsDir(): string {
  return process.env.RELAY_DIAGNOSTICS_DIR
    ?? join(homedir(), '.local-ai-relay', 'diagnostics');
}

export class ChatGptPlaywrightDriver implements BrowserChatDriver {
  private readonly options: Required<ChatGptDriverOptions>;
  private readonly queue = new SerialQueue();
  private context?: BrowserContext;
  private readonly pages = new Map<string, Page>();

  constructor(options: ChatGptDriverOptions = {}) {
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
    const existing = context.pages().find((page) => page.url().startsWith(CHATGPT_URL));
    const page = existing ?? await context.newPage();
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
  }

  /** Wait until the normal ChatGPT composer is usable after login. */
  async waitUntilReady(timeoutMs = 10 * 60_000): Promise<void> {
    const context = await this.getContext();
    const page = context.pages().find((candidate) => candidate.url().startsWith(CHATGPT_URL));
    if (!page) throw new Error('The ChatGPT login page is not open.');
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
    const systemBrowser = await findSystemBrowser();
    if (!systemBrowser) process.env.PLAYWRIGHT_BROWSERS_PATH ??= browserBinariesDir();
    const { chromium } = await import('playwright');
    const executablePath = systemBrowser;
    this.context = await chromium.launchPersistentContext(this.options.profileDir, {
      headless: this.options.headless,
      viewport: { width: 1440, height: 960 },
      ...(executablePath ? { executablePath } : {}),
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
    await page.goto(CHATGPT_URL, { waitUntil: 'domcontentloaded' });
    if (sessionId) this.pages.set(key, page);
    return page;
  }

  private composer(page: Page): Locator {
    return page.locator('div#prompt-textarea, div[contenteditable="true"], [data-testid="composer-text-input"]').first();
  }

  private async sendOnPage(page: Page, request: BrowserChatRequest): Promise<BrowserChatResult> {
    const composer = this.composer(page);
    try {
      await composer.waitFor({ state: 'visible', timeout: 30_000 });
    } catch {
      throw new Error(
        'ChatGPT composer was not found. Run `npm run browser:login`, sign in normally, then retry.',
      );
    }

    const assistantMessages = page.locator('[data-message-author-role="assistant"]');
    const countBefore = await assistantMessages.count();
    await composer.focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(request.prompt);

    const sendButton = page.locator('[data-testid="send-button"]').first();
    let clicked = false;
    try {
      await sendButton.waitFor({ state: 'visible', timeout: 2000 });
      for (let i = 0; i < 15; i++) {
        if (await sendButton.isEnabled().catch(() => false)) {
          await sendButton.click({ force: true });
          clicked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch {
      // Ignore wait errors and fallback to Enter
    }
    if (!clicked) {
      await composer.press('Enter');
    }

    await this.waitForNewAssistantMessage(assistantMessages, countBefore, request.signal);
    const last = assistantMessages.last();
    const text = await this.waitUntilStable(last, request.signal);
    if (!text.trim()) throw new Error('ChatGPT returned an empty response.');
    return { text, conversationUrl: page.url() };
  }

  private async waitForNewAssistantMessage(
    messages: Locator,
    countBefore: number,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < this.options.timeoutMs) {
      if (signal?.aborted) throw new Error('Browser request was cancelled.');
      if (await messages.count() > countBefore) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Timed out waiting for ChatGPT to begin its response.');
  }

  private async waitUntilStable(locator: Locator, signal: AbortSignal | undefined): Promise<string> {
    const started = Date.now();
    let lastText = '';
    let stableSince = Date.now();

    while (Date.now() - started < this.options.timeoutMs) {
      if (signal?.aborted) throw new Error('Browser request was cancelled.');
      const text = await locator.innerText().catch(() => '');
      if (text !== lastText) {
        lastText = text;
        stableSince = Date.now();
      }
      const stopVisible = await locator.page()
        .locator('[data-testid="stop-button"], button[aria-label*="Stop"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (lastText && !stopVisible && Date.now() - stableSince >= this.options.stableMs) {
        return lastText;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error('Timed out waiting for ChatGPT to finish its response.');
  }

  private async captureFailure(page: Page): Promise<void> {
    if (process.env.RELAY_DIAGNOSTICS === '0') return;
    try {
      await mkdir(this.options.diagnosticsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await page.screenshot({
        path: join(this.options.diagnosticsDir, `chatgpt-${stamp}.png`),
        fullPage: false,
      });
    } catch {
      // Diagnostics must never hide the original browser failure.
    }
  }
}
