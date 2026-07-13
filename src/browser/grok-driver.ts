import { BaseBrowserDriver, type SiteConfig } from './base-driver.js';

/** Grok (grok.com) webchat driver. */
export class GrokPlaywrightDriver extends BaseBrowserDriver {
  protected config(): SiteConfig {
    return {
      name: 'grok',
      url: 'https://grok.com/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_GROK',
      composerSelectors: [
        'textarea[aria-label*="Message" i]',
        'textarea[placeholder*="Message" i]',
        'div[contenteditable="true"]',
        'textarea',
      ],
      sendButtonSelectors: [
        'button[aria-label*="Send" i]',
        'button[data-testid="send-button"]',
        'button[type="submit"]',
      ],
      stopButtonSelectors: [
        'button[aria-label*="Stop" i]',
        'button[data-testid="stop-button"]',
      ],
      assistantMessageSelectors: [
        'div[data-testid="message-content"]',
        'div[class*="message-content"]',
        'div[class*="assistant"]',
      ],
      loginUrlPattern: /\/sign_?in|\/login|\/auth\//i,
      signInButtonLabels: ['Sign in', 'Log in', 'Login'],
      rateLimitPattern: /rate limit|too many requests/i,
      quotaPattern: /out of quota|usage (limit|cap) reached|you.?ve reached your limit/i,
    };
  }
}
