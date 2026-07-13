import { BaseBrowserDriver, type SiteConfig } from './base-driver.js';

/** Z.ai / GLM 5.2 (chat.z.ai) webchat driver. */
export class ZaiPlaywrightDriver extends BaseBrowserDriver {
  protected config(): SiteConfig {
    return {
      name: 'zai',
      url: 'https://chat.z.ai/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_ZAI',
      composerSelectors: [
        'textarea[data-testid="composer-text-input"]',
        'textarea[placeholder*="Message" i]',
        'div[contenteditable="true"]',
        'textarea',
      ],
      sendButtonSelectors: [
        'button[data-testid="send-button"]',
        'button[aria-label*="Send" i]',
        'button[type="submit"]',
      ],
      stopButtonSelectors: [
        'button[data-testid="stop-button"]',
        'button[aria-label*="Stop" i]',
      ],
      assistantMessageSelectors: [
        'div[data-testid="assistant-message"]',
        'div[class*="message-content"]',
        'div[class*="assistant"]',
      ],
      loginUrlPattern: /\/sign_?in|\/login|\/auth\//i,
      signInButtonLabels: ['Sign in', 'Log in', 'Login', 'Get started'],
      rateLimitPattern: /rate limit|too many requests|频率过高/i,
      quotaPattern: /out of quota|usage (limit|cap) reached|you.?ve reached your limit/i,
    };
  }
}
