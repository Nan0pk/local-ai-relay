import { BaseBrowserDriver } from './base-driver.js';
import type { BaseDriverOptions, SiteConfig } from './base-driver.js';

export type ClaudeDriverOptions = BaseDriverOptions;

/** Claude.ai configuration for the shared, fixture-tested browser driver. */
export class ClaudePlaywrightDriver extends BaseBrowserDriver {
  constructor(options: ClaudeDriverOptions = {}) {
    super(options);
  }

  protected config(): SiteConfig {
    return {
      name: 'claude',
      url: 'https://claude.ai/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_CLAUDE',
      composerSelectors: [
        'div[contenteditable="true"].ProseMirror',
        'div[contenteditable="true"][data-testid="composer"]',
        'div[contenteditable="true"]',
      ],
      sendButtonSelectors: [
        'button[aria-label="Send Message"]',
        'button[data-testid="send-button"]',
        'button[type="submit"][aria-label*="Send" i]',
      ],
      stopButtonSelectors: [
        'button[aria-label="Stop"]',
        'button[data-testid="stop-button"]',
        'button[aria-label*="Stop" i]',
      ],
      assistantMessageSelectors: [
        '[data-testid="assistant-message"]',
        'div.font-claude-message',
        'div[class*="message"][data-testid*="assistant" i]',
      ],
      loginUrlPattern: /\/login|\/auth\/|\/sign_?in/i,
      signInButtonLabels: ['Sign in', 'Log in', 'Get started'],
      rateLimitPattern: /you.?ve reached your (usage )?limit|rate limit/i,
      quotaPattern: /you.?ve reached your (daily|weekly|monthly) (message )?limit|out of quota|usage cap reached/i,
    };
  }
}
