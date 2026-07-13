import { BaseBrowserDriver, type SiteConfig } from './base-driver.js';

/** Mistral Le Chat (chat.mistral.ai) webchat driver. */
export class MistralPlaywrightDriver extends BaseBrowserDriver {
  protected config(): SiteConfig {
    return {
      name: 'mistral',
      url: 'https://chat.mistral.ai/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_MISTRAL',
      composerSelectors: [
        'textarea[placeholder*="Message" i]',
        'textarea[aria-label*="Message" i]',
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
        'div[class*="message-content"]',
        'div[class*="assistant"]',
        'div[class*="bot-message"]',
      ],
      loginUrlPattern: /\/sign_?in|\/login|\/auth\//i,
      signInButtonLabels: ['Sign in', 'Log in', 'Login', 'Get started'],
      rateLimitPattern: /rate limit|too many requests/i,
      quotaPattern: /out of quota|usage (limit|cap) reached|you.?ve reached your limit/i,
    };
  }
}
