import { BaseBrowserDriver, type SiteConfig } from './base-driver.js';

/** MiniMax Agent (agent.minimax.io) webchat driver. */
export class MinimaxPlaywrightDriver extends BaseBrowserDriver {
  protected config(): SiteConfig {
    return {
      name: 'minimax',
      url: 'https://agent.minimax.io/',
      profileEnvVar: 'RELAY_BROWSER_PROFILE_MINIMAX',
      composerSelectors: [
        'textarea[placeholder*="Message" i]',
        'div[contenteditable="true"][aria-label*="Message" i]',
        'div[contenteditable="true"]',
        'textarea',
      ],
      sendButtonSelectors: [
        'button[aria-label*="Send" i]',
        'button[data-testid="send-button"]',
        'div[role="button"][aria-label*="Send" i]',
      ],
      stopButtonSelectors: [
        'button[aria-label*="Stop" i]',
        'div[role="button"][aria-label*="Stop" i]',
      ],
      assistantMessageSelectors: [
        'div[class*="message-content"]',
        'div[class*="assistant"]',
        'div[class*="bot-message"]',
      ],
      loginUrlPattern: /\/sign_?in|\/login|\/auth\//i,
      signInButtonLabels: ['Sign in', 'Log in', 'Login'],
      rateLimitPattern: /rate limit|too many requests|请求过于频繁/i,
      quotaPattern: /out of quota|usage (limit|cap) reached|you.?ve reached your limit/i,
    };
  }
}
