import { BaseBrowserDriver, type SiteConfig } from './base-driver.js';

/** Meta AI (meta.ai) webchat driver. */
export class MetaPlaywrightDriver extends BaseBrowserDriver {
  protected config(): SiteConfig {
    return {
      name: 'meta',
      url: 'https://www.meta.ai/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_META',
      composerSelectors: [
        '[data-testid="composer-input"][contenteditable="true"]',
        '[data-testid="composer-input"]',
      ],
      sendButtonSelectors: [
        '[data-testid="composer-send-button"]',
        'button[aria-label="Send"]',
      ],
      stopButtonSelectors: [
        '[data-testid="composer-stop-button"]',
        'button[aria-label*="Stop" i]',
      ],
      assistantMessageSelectors: [
        '[data-message-type="assistant"]',
        '[data-testid="assistant-message"]',
        '[data-message-author-role="assistant"]',
      ],
      loginUrlPattern: /\/login|\/oauth|accountscenter\.meta\.com|facebook\.com\/login|instagram\.com\/accounts\/login/i,
      signInButtonLabels: ['Log in', 'Sign in'],
      rateLimitPattern: /rate limit|too many requests|try again later/i,
      quotaPattern: /usage (limit|cap) reached|you.?ve reached your limit|limit resets/i,
    };
  }
}
