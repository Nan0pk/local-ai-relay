import type { Page } from 'patchright';
import { BaseBrowserDriver, type SiteConfig, type BaseDriverOptions } from './base-driver.js';
import type { BrowserChatRequest, BrowserChatResult } from './types.js';

export type ArenaDriverOptions = BaseDriverOptions;

/**
 * LMSYS Chatbot Arena (arena.lmsys.org or chat.lmsys.org) webchat driver.
 *
 * Extends {@link BaseBrowserDriver} to support login-free interaction
 * with the Gradio-based interface. Auto-accepts terms of use and
 * navigates to the "Direct Chat" tab.
 */
export class ArenaPlaywrightDriver extends BaseBrowserDriver {
  constructor(options: ArenaDriverOptions = {}) {
    super(options);
  }

  protected config(): SiteConfig {
    return {
      name: 'arena',
      url: 'https://chat.lmsys.org/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_ARENA',
      composerSelectors: [
        'textarea[data-testid="textbox"]',
        'textarea[placeholder*="Type a message" i]',
        'textarea[placeholder*="Send a message" i]',
        'textarea[placeholder*="Enter message" i]',
        '.gradio-container textarea',
        'textarea',
      ],
      sendButtonSelectors: [
        'button:has-text("Submit")',
        'button:has-text("Send")',
        'button#submit',
        'button[id*="submit" i]',
        'button.primary',
      ],
      stopButtonSelectors: [
        'button:has-text("Stop")',
        'button:has-text("Cancel")',
        'button#stop',
        'button[id*="stop" i]',
      ],
      assistantMessageSelectors: [
        'div[data-testid="chatbot"] div.message.bot',
        '.chatbot .bot',
        '.chatbot div.bot',
        'div.bot',
        'div.message.bot',
      ],
      loginUrlPattern: /\b$/i, // Login-free, so pattern matches nothing
      signInButtonLabels: [],
      rateLimitPattern: /rate limit|too many requests/i,
      quotaPattern: /out of quota|usage (limit|cap) reached/i,
    };
  }

  override async send(request: BrowserChatRequest): Promise<BrowserChatResult> {
    const context = await (this as any).getContext();
    if (!(context as any).__arenaHookRegistered) {
      (context as any).__arenaHookRegistered = true;
      context.on('page', (newPage: Page) => {
        newPage.on('framenavigated', async (frame) => {
          if (frame === newPage.mainFrame()) {
            await this.preparePage(newPage);
          }
        });
      });
    }

    // Ensure all existing pages are prepared
    for (const page of context.pages()) {
      await this.preparePage(page);
    }

    return super.send(request);
  }

  override async openForLogin(): Promise<void> {
    const context = await (this as any).getContext();
    if (!(context as any).__arenaHookRegistered) {
      (context as any).__arenaHookRegistered = true;
      context.on('page', (newPage: Page) => {
        newPage.on('framenavigated', async (frame) => {
          if (frame === newPage.mainFrame()) {
            await this.preparePage(newPage);
          }
        });
      });
    }
    await super.openForLogin();
    for (const page of context.pages()) {
      await this.preparePage(page);
    }
  }

  override async waitUntilReady(timeoutMs?: number): Promise<void> {
    const context = await (this as any).getContext();
    for (const page of context.pages()) {
      await this.preparePage(page);
    }
    await super.waitUntilReady(timeoutMs);
  }

  /**
   * Automates the acceptance of Terms and selection of the "Direct Chat" tab.
   */
  private async preparePage(page: Page): Promise<void> {
    try {
      const url = page.url();
      if (!url.includes('lmsys.org')) {
        return;
      }

      // 1. Accept Terms & Conditions if they are present.
      // Usually there is a checkbox like "I agree to the terms..." and a button like "Acknowledge"
      const checkbox = page.locator('input[type="checkbox"]').first();
      if (await checkbox.isVisible().catch(() => false)) {
        if (!await checkbox.isChecked().catch(() => false)) {
          await checkbox.check({ timeout: 2000 }).catch(() => {});
        }
      }

      const termsButton = page.locator('button:has-text("Acknowledge"), button:has-text("Agree"), button:has-text("Accept"), button:has-text("Join")').first();
      if (await termsButton.isVisible().catch(() => false)) {
        await termsButton.click({ timeout: 2000 }).catch(() => {});
      }

      // 2. Select the "Direct Chat" tab if we are on the main page.
      const directChatTab = page.locator('button:has-text("Direct Chat")').first();
      if (await directChatTab.isVisible().catch(() => false)) {
        await directChatTab.click({ timeout: 2000 }).catch(() => {});
      }
    } catch {
      // Gracefully continue even if page preparation encounters exceptions
    }
  }
}
